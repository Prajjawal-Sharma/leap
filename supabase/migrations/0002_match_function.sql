-- Semantic job matching via pgvector cosine similarity.
-- Returns the top match_count active jobs whose embeddings are within
-- (1 - <=>) > match_threshold of the supplied query embedding.

create or replace function match_jobs(
  query_embedding vector(768),
  match_count int default 50,
  match_threshold float default 0.3
)
returns table (
  job_id uuid,
  similarity float
)
language sql stable
as $$
  select
    je.job_id,
    1 - (je.embedding <=> query_embedding) as similarity
  from job_embeddings je
  inner join jobs j on j.id = je.job_id
  where j.is_active = true
    and 1 - (je.embedding <=> query_embedding) > match_threshold
  order by je.embedding <=> query_embedding
  limit match_count;
$$;
