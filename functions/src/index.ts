import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

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
