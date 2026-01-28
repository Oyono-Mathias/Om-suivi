
"use client";

import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Image from "next/image";
import { useUser, useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, query, where } from "firebase/firestore";
import type { TeamMember, Profile, TimeEntry } from "@/lib/types";
import { Loader2, Users } from "lucide-react";
import { Link } from "@/navigation";
import { PlaceHolderImages } from "@/lib/placeholder-images";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";

export default function TeamPage() {
  const t = useTranslations('TeamPage');
  const tShared = useTranslations('Shared');
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const teamsQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(firestore, 'teams'), where('memberIds', 'array-contains', user.uid));
  }, [firestore, user]);

  const { data: teams, isLoading: isLoadingTeams } = useCollection(teamsQuery);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    const generatedMembers = PlaceHolderImages.map(p => ({
        id: p.id,
        name: p.description.replace('Avatar for ', ''),
        avatarUrl: p.imageUrl,
        avatarHint: p.imageHint,
        totalHours: Math.random() * 40 + 5,
        overtimeHours: Math.random() * 10
    }));
    setTeamMembers(generatedMembers);
  }, []);

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
        <p className="text-xl">{tShared('pleaseLogin')}</p>
        <Link href="/login">
          <Button>{tShared('loginButton')}</Button>
        </Link>
      </div>
    );
  }
  
  if (!teams || teams.length === 0) {
    return (
      <div className="flex flex-col justify-center items-center h-screen gap-4 text-center">
        <Users className="w-16 h-16 text-muted-foreground" />
        <h2 className="text-2xl font-bold">{t('noTeamTitle')}</h2>
        <p className="text-muted-foreground max-w-sm">{t('noTeamDescription')}</p>
      </div>
    )
  }


  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-headline font-bold">{t('title')}</h1>
      <p className="text-muted-foreground">
        {t('description')}
      </p>

      <Card>
        <CardHeader>
          <CardTitle>{t('weeklySummaryTitle')}</CardTitle>
          <CardDescription>{t('weeklySummaryDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
           <div className="space-y-4">
              {isClient && teamMembers.length > 0 ? (
                teamMembers.map((member) => (
                  <Card key={member.id} className="flex items-center p-4 gap-4">
                    <Avatar className="h-12 w-12">
                          <AvatarImage asChild src={member.avatarUrl}>
                            <Image src={member.avatarUrl} alt={member.name} width={48} height={48} data-ai-hint={member.avatarHint} />
                          </AvatarImage>
                          <AvatarFallback>{member.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                          <p className="font-medium">{member.name}</p>
                          <div className="flex justify-between text-sm text-muted-foreground">
                              <span>{t('tableTotalHours')}:</span>
                              <span>{member.totalHours.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-sm text-muted-foreground">
                              <span>{t('tableOvertimeHours')}:</span>
                              <span className="font-medium text-destructive">{member.overtimeHours.toFixed(2)}</span>
                          </div>
                      </div>
                  </Card>
                ))
              ) : (
                <div className="space-y-4">
                  {PlaceHolderImages.map((p) => (
                      <Card key={p.id} className="flex items-center p-4 gap-4">
                          <Skeleton className="h-12 w-12 rounded-full" />
                          <div className="flex-1 space-y-2">
                              <Skeleton className="h-4 w-3/4" />
                              <Skeleton className="h-4 w-1/2" />
                          </div>
                      </Card>
                  ))}
                </div>
              )}
            </div>
        </CardContent>
      </Card>
    </div>
  );
}
