
"use client";

import React from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Image from "next/image";
import { useUser, useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, query, where } from "firebase/firestore";
import type { TeamMember, Profile, TimeEntry } from "@/lib/types";
import { Loader2, Users } from "lucide-react";
import Link from "next/link";
import { PlaceHolderImages } from "@/lib/placeholder-images";
import { getWeek, startOfWeek, endOfWeek, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";


export default function TeamPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const teamsQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(firestore, 'teams'), where('memberIds', 'array-contains', user.uid));
  }, [firestore, user]);

  const { data: teams, isLoading: isLoadingTeams } = useCollection(teamsQuery);

  const teamId = teams?.[0]?.id;

  const teamMembersQuery = useMemoFirebase(() => {
    if (!teamId) return null;
    // This is a simplified query. In a real app, you'd likely fetch profiles based on memberIds.
    // For now, we are assuming a 'profiles' collection exists with documents whose IDs match the UIDs.
    return collection(firestore, 'users');
  }, [firestore, teamId]);
  
  const { data: allUsers, isLoading: isLoadingMembers } = useCollection<Profile>(teamMembersQuery);

  const teamTimeEntriesQuery = useMemoFirebase(() => {
    if (!teamId || !teams?.[0]?.memberIds) return null;
    
    // This is not efficient for large teams. A better approach would be needed for production.
    // For this prototype, we'll fetch all time entries and filter client-side.
    // This assumes a flat `timeEntries` collection or requires multiple queries.
    // Let's assume we can query a subcollection for each user in the team.
    // This part is complex and depends heavily on the final data structure.
    // For now, we will stick with the placeholder data.
    return null;
  }, [firestore, teamId, teams]);
  
  // Using placeholder data since real-time team data aggregation is complex
  const teamMembers: TeamMember[] = PlaceHolderImages.map(p => ({
      id: p.id,
      name: p.description.replace('Avatar for ', ''),
      avatarUrl: p.imageUrl,
      avatarHint: p.imageHint,
      totalHours: Math.random() * 40 + 5, // random data
      overtimeHours: Math.random() * 10
  }));


  if (isUserLoading || isLoadingTeams) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-16 w-16 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col justify-center items-center h-screen gap-4">
        <p className="text-xl">Veuillez vous connecter pour continuer.</p>
        <Link href="/login">
          <Button>Se connecter</Button>
        </Link>
      </div>
    );
  }
  
  if (!teams || teams.length === 0) {
    return (
      <div className="flex flex-col justify-center items-center h-screen gap-4 text-center">
        <Users className="w-16 h-16 text-muted-foreground" />
        <h2 className="text-2xl font-bold">Vous n'êtes pas encore dans une équipe</h2>
        <p className="text-muted-foreground max-w-sm">Contactez votre administrateur pour être ajouté à une équipe afin de voir les données de vos collègues.</p>
      </div>
    )
  }


  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-headline font-bold">Aperçu de l'Équipe</h1>
      <p className="text-muted-foreground">
        Un résumé des heures travaillées par vos collègues cette semaine.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Résumé Hebdomadaire</CardTitle>
          <CardDescription>Partage et résumé des données pour les collègues.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Membre</TableHead>
                <TableHead>Heures Totales</TableHead>
                <TableHead>Heures Sup.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teamMembers.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarImage asChild src={member.avatarUrl}>
                          <Image src={member.avatarUrl} alt={member.name} width={40} height={40} data-ai-hint={member.avatarHint} />
                        </AvatarImage>
                        <AvatarFallback>{member.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{member.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>{member.totalHours.toFixed(2)}</TableCell>
                  <TableCell>{member.overtimeHours.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
