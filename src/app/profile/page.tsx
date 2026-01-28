
"use client";

import React, { useContext, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { AppContext } from "@/context/AppContext";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

const profileSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters." }),
  monthlyBaseSalary: z.coerce.number().min(1, { message: "Base salary must be positive." }),
  currency: z.string().min(1, { message: "Currency symbol is required."}),
  reminders: z.object({
    enabled: z.boolean(),
    time: z.string(),
  }),
});

export default function ProfilePage() {
  const { profile, updateProfile } = useContext(AppContext);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: profile,
  });
  
  useEffect(() => {
    form.reset(profile);
  }, [profile, form]);


  function onSubmit(values: z.infer<typeof profileSchema>) {
    updateProfile(values);
    toast({
      title: "Settings Updated",
      description: "Your information has been saved successfully.",
    });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-headline font-bold">Settings</h1>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>Personal & Financial Information</CardTitle>
              <CardDescription>
                Manage your personal and contractual details.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Mathias Oyono" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="monthlyBaseSalary"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Monthly Base Salary</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="e.g., 72799" {...field} />
                      </FormControl>
                      <FormDescription>
                        Your hourly rate is automatically calculated (Salary / 173.33) and rounded.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <FormField
                  control={form.control}
                  name="currency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Currency Symbol</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., FCFA" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Reminders</CardTitle>
              <CardDescription>
                Set up alerts to prevent missed time entries.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="reminders.enabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Enable Reminders</FormLabel>
                      <FormDescription>
                        Receive a notification to log your hours.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="reminders.time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reminder Time</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} className="w-auto" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>
          
          <Button type="submit">Save Changes</Button>
        </form>
      </Form>
    </div>
  );
}
