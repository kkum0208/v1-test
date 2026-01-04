import { GoogleGenAI } from "@google/genai";
import { Fighter } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getSenseiFeedback = async (
  winner: Fighter,
  loser: Fighter,
  matchDuration: number
): Promise<string> => {
  try {
    const prompt = `
      You are a wise martial arts Grandmaster. A match has just ended.
      
      Details:
      - Winner: ${winner.stats.name} using the ${winner.stats.style} style.
      - Loser: ${loser.stats.name} using the ${loser.stats.style} style.
      - Winner HP Remaining: ${Math.round(winner.stats.hp)}/${winner.stats.maxHp}.
      - Match Duration: ${60 - matchDuration} seconds.

      The ${winner.stats.style} style is known for ${winner.stats.style === 'Tai Chi' ? 'fluidity, patience, and using the opponent\'s force against them' : 'speed, aggression, and efficient close-range striking'}.
      
      Provide a brief, deep, and philosophical comment on why the winner prevailed or a lesson for the loser. Keep it under 2 sentences. Speak like an old Kung Fu master.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });

    return response.text || "The mind must be sharper than the fist.";
  } catch (error) {
    console.error("Sensei is meditating (API Error):", error);
    return "Victory is its own reward. The API spirits are quiet today.";
  }
};