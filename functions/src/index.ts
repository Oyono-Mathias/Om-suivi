import { onSchedule } from "firebase-functions/v2/scheduler";
import { randomBytes } from "node:crypto";
import * as admin from "firebase-admin";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { google } from "googleapis";
import { logger } from "firebase-functions";
import { defineSecret } from "firebase-functions/params";
import {
  addLocalDay,
  calculateTrustedDurations,
  getDoualaDateAndTime,
  localDateTimeToUtcMillis,
  parseClockMinutes,
} from "./attendance-calculations.js";

// Initialize Firebase Admin SDK
try {
  admin.app();
} catch (e) {
  admin.initializeApp();
}
const db = admin.firestore();


// --- Google Calendar Integration ---

// Production credentials are stored in Google Secret Manager.
const googleClientIdSecret = defineSecret("GOOGLE_CLIENT_ID");
const googleClientSecretSecret = defineSecret("GOOGLE_CLIENT_SECRET");
const googleRedirectUriSecret = defineSecret("GOOGLE_REDIRECT_URI");
const googleOAuthSecrets = [
  googleClientIdSecret,
  googleClientSecretSecret,
  googleRedirectUriSecret,
];

function createOAuth2Client() {
  return new google.auth.OAuth2(
    googleClientIdSecret.value(),
    googleClientSecretSecret.value(),
    googleRedirectUriSecret.value()
  );
}

const scopes = ["https://www.googleapis.com/auth/calendar.events"];

/**
 * One-time migration for the employee directory.
 * Copies only non-sensitive fields from /users into /publicProfiles.
 */
export const syncPublicProfiles = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Authentication is required.");
  }

  const adminSnapshot = await db.collection("users").doc(uid).get();
  if (adminSnapshot.data()?.role !== "admin") {
    throw new HttpsError("permission-denied", "Administrator access is required.");
  }

  const usersSnapshot = await db.collection("users").get();
  let synced = 0;

  for (let offset = 0; offset < usersSnapshot.docs.length; offset += 400) {
    const batch = db.batch();
    const chunk = usersSnapshot.docs.slice(offset, offset + 400);

    for (const userDoc of chunk) {
      const userData = userDoc.data();
      batch.set(db.collection("publicProfiles").doc(userDoc.id), {
        id: userDoc.id,
        name: typeof userData.name === "string" ? userData.name : "Membre",
        profession: typeof userData.profession === "string" ? userData.profession : "other",
      });
    }

    await batch.commit();
    synced += chunk.length;
  }

  logger.info("Synchronized public employee profiles.", { adminUid: uid, synced });
  return { synced };
});

/**
 * One-time migration of legacy Google refresh tokens out of readable user profiles.
 * Invoke as an administrator after deploying the private-token rules.
 */
export const migrateGoogleCalendarTokens = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Authentication is required.");
  }

  const adminSnapshot = await db.collection("users").doc(uid).get();
  if (adminSnapshot.data()?.role !== "admin") {
    throw new HttpsError("permission-denied", "Administrator access is required.");
  }

  const usersSnapshot = await db.collection("users").get();
  let migrated = 0;

  for (let offset = 0; offset < usersSnapshot.docs.length; offset += 400) {
    const chunk = usersSnapshot.docs.slice(offset, offset + 400);
    for (const userDoc of chunk) {
      const legacyToken = userDoc.data().googleRefreshToken;
      if (typeof legacyToken !== "string" || !legacyToken) continue;

      await db.collection("googleCalendarTokens").doc(userDoc.id).set({
        refreshToken: legacyToken,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await userDoc.ref.update({
        googleRefreshToken: admin.firestore.FieldValue.delete(),
        googleCalendarConnected: true,
      });
      migrated += 1;
    }
  }

  logger.info("Migrated legacy Google Calendar credentials.", { adminUid: uid, migrated });
  return { migrated };
});

/**
 * 1. `authGoogle` (Callable Function)
 * Generates an authorization URL for the user to grant calendar access.
 */
export const authGoogle = onCall({ secrets: googleOAuthSecrets }, async (request) => {
  if (!googleClientIdSecret.value() || !googleClientSecretSecret.value() || !googleRedirectUriSecret.value()) {
    throw new HttpsError("failed-precondition", "Google Calendar OAuth is not configured.");
  }

  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }

  // OAuth state is a one-time, unpredictable CSRF token; never expose the UID in it.
  const oauth2Client = createOAuth2Client();
  const stateToken = randomBytes(32).toString("hex");
  await db.collection("oauthStates").doc(stateToken).create({
    uid,
    createdAt: Date.now(),
  });

  const authorizationUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    include_granted_scopes: true,
    prompt: "consent", // Important to get a refresh token every time.
    state: stateToken,
  });

  return { authorizationUrl };
});


/**
 * 2. `authGoogleCallback` (HTTP Request Function)
 * Handles the callback from Google's consent screen.
 */
export const authGoogleCallback = onRequest({ secrets: googleOAuthSecrets }, async (req, res) => {
  if (req.method !== "GET") {
    res.set("Allow", "GET").status(405).send("Method not allowed.");
    return;
  }
  if (!googleClientIdSecret.value() || !googleClientSecretSecret.value() || !googleRedirectUriSecret.value()) {
    res.status(503).send("Google Calendar OAuth is not configured.");
    return;
  }

  const { code, state } = req.query;

  if (!code || typeof code !== "string") {
    res.status(400).send("Authorization code is missing.");
    return;
  }
  if (typeof state !== "string" || !/^[a-f0-9]{64}$/.test(state)) {
    res.status(400).send("Invalid OAuth state.");
    return;
  }

  try {
    // Consume the state atomically so it cannot be replayed or used for another UID.
    const stateRef = db.collection("oauthStates").doc(state);
    const uid = await db.runTransaction(async (transaction) => {
      const stateSnapshot = await transaction.get(stateRef);
      if (!stateSnapshot.exists) return null;

      const stateData = stateSnapshot.data();
      transaction.delete(stateRef);

      if (
        typeof stateData?.uid !== "string" ||
        typeof stateData?.createdAt !== "number" ||
        Date.now() - stateData.createdAt > 10 * 60 * 1000 ||
        Date.now() < stateData.createdAt
      ) {
        return null;
      }

      return stateData.uid;
    });

    if (!uid) {
      res.status(400).send("OAuth state is expired or has already been used.");
      return;
    }

    const oauth2Client = createOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    const refreshToken = tokens.refresh_token;

    if (!refreshToken) {
      logger.error("Refresh token was not provided by Google. This can happen if the user has already granted consent and is not re-prompted. The 'prompt: \"consent\"' setting should prevent this.", { uid });
      res.status(500).send("Could not retrieve refresh token from Google. Please try connecting again.");
      return;
    }

    const userRef = db.collection("users").doc(uid);
    await db.collection("googleCalendarTokens").doc(uid).set({
      refreshToken,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await userRef.set({ googleCalendarConnected: true }, { merge: true });

    logger.info("Successfully connected Google Calendar for user.", { uid });
    res.redirect("/profil");
  } catch (error) {
    logger.error("Error exchanging auth code for tokens:", error);
    res.status(500).send("An error occurred during Google authentication.");
  }
});


/**
 * All employee-controlled time fields are treated as requests only.
 * The server stamps shift starts/stops and calculates payable durations.
 * Manually reported shifts are recalculated before payroll can use them.
 */
export const onTimeEntryEndCreateEvent = onDocumentWritten({
  document: "users/{userId}/timeEntries/{timeEntryId}",
  secrets: googleOAuthSecrets,
}, async (firestoreEvent) => {
  if (!firestoreEvent.data) return;

  const { userId, timeEntryId } = firestoreEvent.params;
  const entryRef = firestoreEvent.data.after.ref;
  const currentSnapshot = await entryRef.get();
  const currentData = currentSnapshot.data();
  if (!currentData) return;

  const beforeData = firestoreEvent.data.before.data();
  const isActiveStartCreation = !beforeData
    && currentData.endTime === ''
    && currentData.modified_manually !== true
    && !currentData.serverStartedAt;
  const isManualEntryCreation = currentData.modified_manually === true
    && currentData.location === "Manual"
    && typeof currentData.endTime === "string"
    && currentData.endTime.length > 0
    && !currentData.serverCalculatedAt;
  const isStopRequest = Boolean(currentData.stopRequestedAt)
    && currentData.endTime === ''
    && Boolean(currentData.serverStartedAt)
    && !currentData.serverCalculatedAt;

  if (!isActiveStartCreation && !isManualEntryCreation && !isStopRequest) return;

  const userRef = db.collection("users").doc(userId);
  const [userSnapshot, settingsSnapshot] = await Promise.all([
    userRef.get(),
    db.collection("settings").doc("global").get(),
  ]);
  const userData = userSnapshot.data();
  if (!userData) {
    logger.error("Cannot process attendance for a missing user profile.", { userId, timeEntryId });
    return;
  }

  if (isActiveStartCreation) {
    const serverStart = getDoualaDateAndTime(new Date(firestoreEvent.time));
    const stamped = await db.runTransaction(async (transaction) => {
      const latestSnapshot = await transaction.get(entryRef);
      const latestData = latestSnapshot.data();
      if (!latestData || latestData.serverStartedAt) return false;
      transaction.update(entryRef, {
        date: serverStart.date,
        startTime: serverStart.time,
        profession: userData.profession,
        userProfileId: userId,
        serverStartedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return true;
    });
    if (stamped) logger.info("Stamped trusted shift start.", { userId, timeEntryId });
    return;
  }

  let endDate: string;
  let endTime: string;
  if (isStopRequest) {
    const eventDate = new Date(firestoreEvent.time);
    const startUtc = localDateTimeToUtcMillis(String(currentData.date), String(currentData.startTime));
    if (startUtc > eventDate.getTime() + 60_000) {
      logger.warn("Rejected a shift stop request with a future start time.", { userId, timeEntryId });
      return;
    }
    const localEnd = getDoualaDateAndTime(eventDate);
    endDate = localEnd.date;
    endTime = localEnd.time;
  } else {
    endTime = String(currentData.endTime);
    endDate = String(currentData.date);
    const startMinutes = parseClockMinutes(currentData.startTime);
    const endMinutes = parseClockMinutes(endTime);
    if (startMinutes === null || endMinutes === null) {
      logger.warn("Rejected a manual time entry with an invalid clock value.", { userId, timeEntryId });
      return;
    }
    if (endMinutes <= startMinutes) endDate = addLocalDay(endDate);
  }

  const eligibleForOvertime = [
    "storekeeper",
    "deliveryDriver",
    "chauffeur",
    "machinist",
  ].includes(String(userData.profession));
  const calculated = calculateTrustedDurations(
    currentData,
    endDate,
    endTime,
    Number(settingsSnapshot.data()?.breakDuration ?? 0),
    eligibleForOvertime
  );
  if (!calculated) {
    logger.warn("Rejected an invalid or overlong time entry.", { userId, timeEntryId });
    return;
  }

  const calculationCommitted = await db.runTransaction(async (transaction) => {
    const latestSnapshot = await transaction.get(entryRef);
    const latestData = latestSnapshot.data();
    if (!latestData || latestData.serverCalculatedAt) return false;
    if (isStopRequest && latestData.endTime !== '') return false;
    if (isManualEntryCreation && (
      latestData.modified_manually !== true
      || latestData.location !== "Manual"
      || !latestData.endTime
    )) return false;

    transaction.update(entryRef, {
      endTime,
      duration: calculated.duration,
      overtimeDuration: calculated.overtimeDuration,
      profession: userData.profession,
      serverCalculatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return true;
  });
  if (!calculationCommitted) return;

  logger.info("Calculated trusted shift duration.", {
    userId,
    timeEntryId,
    duration: calculated.duration,
    overtimeDuration: calculated.overtimeDuration,
  });

  if (!userData.googleCalendarConnected) return;

  const tokenDoc = await db.collection("googleCalendarTokens").doc(userId).get();
  const refreshToken = tokenDoc.data()?.refreshToken;
  if (typeof refreshToken !== "string" || !refreshToken) {
    logger.log("Google Calendar token is unavailable; skipping event creation.", { userId });
    return;
  }

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });
  const calendarEvent = {
    summary: `${userData.name} - OM-Suivi: ${currentData.shiftId}`,
    description: "Récapitulatif de session enregistré via l'application OM-Suivi.",
    start: {
      dateTime: `${currentData.date}T${currentData.startTime}:00`,
      timeZone: "Africa/Douala",
    },
    end: {
      dateTime: `${endDate}T${endTime}:00`,
      timeZone: "Africa/Douala",
    },
  };

  try {
    await calendar.events.insert({
      calendarId: "primary",
      requestBody: calendarEvent,
    });
    logger.info("Successfully created calendar event for user.", { userId, timeEntryId });
  } catch (error) {
    logger.error("Error creating calendar event:", { userId, error });
    if ((error as any).code === 401 || (error as any).response?.status === 401) {
      await Promise.all([
        userRef.update({ googleCalendarConnected: false }),
        tokenDoc.ref.delete(),
      ]);
      logger.warn("Removed invalid Google refresh token for user.", { userId });
    }
  }
});


// Original function
// Cette fonction s'exécute toutes les 15 minutes
export const checkActiveShifts = onSchedule("every 15 minutes", async (event) => {
  const now = new Date();
  const EIGHT_HOURS_FIFTEEN_MINUTES_MS = 8.25 * 60 * 60 * 1000;

  // Recherche les services actifs (sans heure de fin)
  const activeEntriesSnapshot = await db
    .collectionGroup("timeEntries")
    .where("endTime", "==", "")
    .get();

  if (activeEntriesSnapshot.empty) {
    return;
  }

  const tasks = activeEntriesSnapshot.docs.map(async (doc) => {
    const entry = doc.data();
    const startTime = entry.serverStartedAt?.toDate
      ? entry.serverStartedAt.toDate()
      : new Date(`${entry.date}T${entry.startTime}`);
    const durationMs = now.getTime() - startTime.getTime();

    if (durationMs > EIGHT_HOURS_FIFTEEN_MINUTES_MS) {
      // Récupère le jeton (token) de l'utilisateur
      const userDoc = await db.collection("users").doc(entry.userProfileId).get();
      const userData = userDoc.data();

      if (userData?.fcmToken) {
        const message = {
          notification: {
            title: "OM Suivi: Activité en cours?",
            body: "Votre service est actif depuis plus de 8h15. Validez pour continuer.",
          },
          token: userData.fcmToken,
          webpush: {
            fcmOptions: {
              link: "/",
            },
          },
        };
        return admin.messaging().send(message);
      }
    }
    return null;
  });

  await Promise.all(tasks);
});
