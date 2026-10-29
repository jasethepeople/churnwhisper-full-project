# ChurnWhisper backend
3 edge functions:
- score: Ollama wrapper with heuristic fallback
- ingest: email webhook -> score -> supabase insert
- stripe: checkout + webhook + weekly digest cron

Frontend is single file: ../churnwhisper_single_file_agentic_artifact_1_5378b3ebaae0.html
