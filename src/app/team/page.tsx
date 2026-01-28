"use client";

import React, { useContext } from "react";
import { AppContext } from "@/context/AppContext";
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

export default function TeamPage() {
  const { teamMembers } = useContext(AppContext);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-headline font-bold">Team Overview</h1>
      <p className="text-muted-foreground">
        A summary of hours worked by your colleagues this week.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Weekly Summary</CardTitle>
          <CardDescription>Data sharing and summarization for colleagues.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Total Hours</TableHead>
                <TableHead>Overtime Hours</TableHead>
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
