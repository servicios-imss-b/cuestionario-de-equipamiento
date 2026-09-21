# Cuestionario de Equipamiento

Aplicación para capturar y consultar información de equipamiento por unidad médica del IMSS-Bienestar.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Supabase data model

`public.respuestas` stores one `unidad` row per CLUES and one `consultorio` row per office. Equipment quantities use the 65 physical columns `p_1` through `p_65`; each suffix is the stable ID from `src/data/questions.json`. `turno_consultorio` stores `Matutino`, `Vespertino`, or `Ambos`; `turno` stores the weekly schedule as comma-separated values such as `matutino-lunes-med, vespertino-jueves`, where `-med` indicates doctor availability.
