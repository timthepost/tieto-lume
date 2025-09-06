# Retrieval Augmented Generation Using Lume & Tieto

This repo will soon have a fully-functional, template-able and deployable RAG setup that uses
Lume as a data store and web front-end, Tieto as a fast vector search powered prompt generator, 
and any completion model that you want. It will support the Nomic API or a local embedding model, 
as well as any OpenAI / llama compatible completion endpoint.

The author will be hositing his own phi-3 instance to power his professional / career site, 
allowing recruiters to ask questions without having to schedule phone calls, which is what kicked
off this madness.

Lume's router middleware will handle directing traffic to local or third party models for query and
embedding needs (all .md / frontmatter content gets indexed at build), so this should run just fine
for absolutely free on Deno Deploy or Netlify since it just uses the file system.

Could be conceivably souped up even more with DenoKV integration (just remember that clustered indexing
is planned for Tieto, and will be faster since it uses the FS and simple cosine similiarity for the 
first pass).

## Shoelace Components Ahead

I didn't want to marry this to any specific CSS or JS / TS platform beyond the very tight coupling 
with Deno. So, everything in this is being put together with Shoelace. It's a fast path to something
at least mostly accessible that can evolve quickly without much sweat or design overhead. It has 
icons, components, whatever - and it's solid. 

## Lume = Perfect Match For Tieto

Lume and Tieto (very intentionally) both use the same common frontmatter / markdown format that 
most other documentation and content orientesd sites use. This was no accident, I wanted Tieto to 
be a drop-in RAG that's easy to deploy to any docs site or personal blog. This is me going further
in that implementation direction.

What makes Lume stand out as the best candidate is the very smart data layer, the ability to run 
basic functions in server middleware and the extremely flexible design. Tieto just sits right on 
top of a Lume instance with no real modification.

## This is Minimal. M - I - N - I - M - A

So much so that I even left off the last consonant in the heading. No css processors or anything 
beyond the bare minimum. Shoelace (light + dark) is loaded, then `/style.css` is loaded which 
is intended for whatever local styles are needed on top of Shoelace.

What the project will provide:

 - Basic Lume instance pre-configured with Tieto
 - Front-end to query for generation (chat interface to interact with librarian model)
 - Links to source material used for generation in chat (produced by Lume, Tieto indexes the markdown source)
 - API to query RAG directly (OpenAI completion compatible)
 - API for MCP (Model Conetext Protocol) service with ChatGPT friendly shim route that hides most tools

What you will provide:

 - Markdown docs organized as Tieto topics (directories full of related markdown files)
 - Deno (with or without Deno Deploy)
 - API keys for a good embedding model and completion model (can be self-hosted GGUF, too) 
 - Some vision as to what you can accomplish with what the project provides

### Why?

The author is a brain cancer survivor who is still employable, but not very keen on talking to 
recruiters. To eliminate the bottlenecks of scheduling and email tag, and to build a fun and 
fully-interactive "Resume" style site on top of a hand-rolled RAG, of course! 

Wouldn't everyone?
