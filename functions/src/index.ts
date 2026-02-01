import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onCall, onRequest } from "firebase-functions/v2/https";
import { google } from "googleapis";
import { logger } from "firebase-functions";

// Initialize Firebase Admin SDK
try {
  admin.app();
} catch (e) {
  admin.initializeApp();
}
const db = admin.firestore();


// --- Google Calendar Integration ---

// TODO: Set these environment variables in your Firebase project settings
// You can get these from the Google Cloud Console for your project.
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
// This must be the URL of your `authGoogleCallback` function.
// You can get this from the Firebase console after deployment.
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI
);

const scopes = ["https://www.googleapis.com/auth/calendar.events"];

/**
 * 1. `authGoogle` (Callable Function)
 * Generates an authorization URL for the user to grant calendar access.
 */
export const authGoogle = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new https.HttpsError("unauthenticated", "The function must be called while authenticated.");
  }

  const authorizationUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    include_granted_scopes: true,
    prompt: "consent", // Important to get a refresh token every time.
    state: uid, // Pass the user's UID to identify them in the callback
  });

  return { authorizationUrl };
});


/**
 * 2. `authGoogleCallback` (HTTP Request Function)
 * Handles the callback from Google's consent screen.
 */
export const authGoogleCallback = onRequest({ cors: true }, async (req, res) => {
  const { code, state } = req.query;
  const uid = state as string;

  if (!code || typeof code !== "string") {
    res.status(400).send("Authorization code is missing.");
    return;
  }
  if (!uid) {
    res.status(400).send("State (User ID) is missing.");
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    const refreshToken = tokens.refresh_token;

    if (!refreshToken) {
      logger.error("Refresh token was not provided by Google. This can happen if the user has already granted consent and is not re-prompted. The 'prompt: \"consent\"' setting should prevent this.", { uid });
      res.status(500).send("Could not retrieve refresh token from Google. Please try connecting again.");
      return;
    }

    const userRef = db.collection("users").doc(uid);
    await userRef.set({
      googleCalendarConnected: true,
      googleRefreshToken: refreshToken,
    }, { merge: true });

    logger.info("Successfully connected Google Calendar for user.", { uid });
    res.redirect("/profil");
  } catch (error) {
    logger.error("Error exchanging auth code for tokens:", error);
    res.status(500).send("An error occurred during Google authentication.");
  }
});


/**
 * 3. `onTimeEntryEndCreateEvent` (Firestore Trigger)
 * Creates a calendar event automatically when a shift's endTime is added.
 */
export const onTimeEntryEndCreateEvent = onDocumentWritten("users/{userId}/timeEntries/{timeEntryId}", async (event) => {
  if (!event.data) {
    return; // Document was deleted, do nothing
  }

  const beforeData = event.data.before.data();
  const afterData = event.data.after.data();

  // Trigger only when a shift has just ended (endTime was empty/null before, and now has a value)
  if (!afterData || beforeData?.endTime || !afterData.endTime) {
    return;
  }

  const { userId, timeEntryId } = event.params;
  const userRef = db.collection("users").doc(userId);
  const userDoc = await userRef.get();
  const userData = userDoc.data();

  if (!userData?.googleCalendarConnected || !userData.googleRefreshToken) {
    logger.log("User has not connected Google Calendar, skipping event creation.", { userId });
    return;
  }

  oauth2Client.setCredentials({ refresh_token: userData.googleRefreshToken });
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  const event = {
    summary: `${userData.name} - OM-Suivi: ${afterData.shiftId}`,
    description: "Récapitulatif de session enregistré via l'application OM-Suivi.",
    start: {
      dateTime: new Date(`${afterData.date}T${afterData.startTime}`).toISOString(),
      timeZone: "Africa/Douala",
    },
    end: {
      dateTime: new Date(`${afterData.date}T${afterData.endTime}`).toISOString(),
      timeZone: "Africa/Douala",
    },
  };

  if (new Date(event.end.dateTime) < new Date(event.start.dateTime)) {
      const endDate = new Date(event.end.dateTime);
      endDate.setDate(endDate.getDate() + 1);
      event.end.dateTime = endDate.toISOString();
  }

  try {
    await calendar.events.insert({
      calendarId: "primary",
      requestBody: event,
    });
    logger.info("Successfully created calendar event for user.", { userId, timeEntryId });
  } catch (error) {
    logger.error("Error creating calendar event:", { userId, error });
    // If the token is invalid (e.g., revoked by user), disconnect the integration.
    if ((error as any).code === 401 || (error as any).response?.status === 401) {
        await userRef.update({
            googleCalendarConnected: false,
            googleRefreshToken: admin.firestore.FieldValue.delete(),
        });
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
    const startTime = new Date(`${entry.date}T${entry.startTime}`);
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
