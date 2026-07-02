-- Morax - verrou doc_number : empeche deux documents finalises de partager
-- le meme numero pour un meme tenant/kind. Index partiel (status <> 'draft')
-- car les brouillons non finalises peuvent temporairement dupliquer un
-- numero en cours de saisie ; l'unicite ne compte qu'a la finalisation.

create unique index if not exists document_drafts_doc_number_key
  on public.document_drafts (tenant_id, kind, doc_number)
  where status <> 'draft';
