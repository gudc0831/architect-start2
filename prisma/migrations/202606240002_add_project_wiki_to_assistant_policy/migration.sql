alter table public.assistant_run_policies
  alter column allowed_evidence_kinds set default '["central_knowledge","project_wiki","regulation","task","project_document","web_or_skill"]'::jsonb;

update public.assistant_run_policies
set allowed_evidence_kinds = '["central_knowledge","project_wiki","regulation","task","project_document","web_or_skill"]'::jsonb
where allowed_evidence_kinds = '["central_knowledge","regulation","task","project_document","web_or_skill"]'::jsonb;
