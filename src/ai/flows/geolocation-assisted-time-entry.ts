'use server';

/**
 * @fileOverview A flow to suggest work location based on geolocation for time entries.
 *
 * - suggestWorkLocation - A function that handles the suggestion of work location based on geolocation.
 * - GeolocationAssistedTimeEntryInput - The input type for the suggestWorkLocation function.
 * - GeolocationAssistedTimeEntryOutput - The return type for the suggestWorkLocation function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GeolocationAssistedTimeEntryInputSchema = z.object({
  latitude: z.number().describe('The latitude of the user.'),
  longitude: z.number().describe('The longitude of the user.'),
});
export type GeolocationAssistedTimeEntryInput = z.infer<typeof GeolocationAssistedTimeEntryInputSchema>;

const GeolocationAssistedTimeEntryOutputSchema = z.object({
  suggestedLocation: z.string().describe('The suggested work location based on geolocation.'),
});
export type GeolocationAssistedTimeEntryOutput = z.infer<typeof GeolocationAssistedTimeEntryOutputSchema>;

export async function suggestWorkLocation(input: GeolocationAssistedTimeEntryInput): Promise<GeolocationAssistedTimeEntryOutput> {
  return geolocationAssistedTimeEntryFlow(input);
}

const prompt = ai.definePrompt({
  name: 'geolocationAssistedTimeEntryPrompt',
  input: {schema: GeolocationAssistedTimeEntryInputSchema},
  output: {schema: GeolocationAssistedTimeEntryOutputSchema},
  prompt: `You are a geolocation expert. Given the latitude and longitude, suggest a work location.

Latitude: {{{latitude}}}
Longitude: {{{longitude}}}

Suggest work location:`,
});

const geolocationAssistedTimeEntryFlow = ai.defineFlow(
  {
    name: 'geolocationAssistedTimeEntryFlow',
    inputSchema: GeolocationAssistedTimeEntryInputSchema,
    outputSchema: GeolocationAssistedTimeEntryOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
