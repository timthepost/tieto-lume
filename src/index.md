# Semantic Retrieval Augmented Generation With Lume

This is a project to bring [Tieto][1]'s flat-file embedding storage and 
semantic matching capabilities to [Lume][2]'s powerful document processing
and generation capabilities and data model in order to produce a semantic
data store that runs happily at the edge with few resources.

That sounds like a mouth full, so it's easier to tell you what you can do
with it instead:

 - Build powerful semantic search into your document site or blog that you
 can fine-tune; use a free Nomic Atlas key for embedding, or (with a VPS
 and 256 MB of RAM) do your own embeddings

 - Provide verbatim, semantic-accessible of LLM conversations through [MCP][3]
 interaction (using Lume's [router middleware][4])

 - Provide LLMs semantically-accessible short-term memory that you host
 through MCP.

 - Easily create "Librarian" agents to narrate any given text corpus, useful
 for corporate assistants. 

Because Tieto adds no dependencies on top of Lume, it doesn't alter the existing 
SOC footprint for most companies, so it's an ideal RAG for teams that just need 
to have access to something that works (runs fine on an old 13 chrome book, Nomic
Text v2 1.3B model included!)

## Requirements

If you just want ***semantic search***, meaning you want something like a basic 
version of Algolia but you own 100% of the code:

 - You will need to have a free [Nomic Atlas][5] key, or the ability to run 
 the open source [Nomic Text v2][6] model (`.gguf format`) with llama.cpp[7]
 or similar.

 - You will need to be able to host a Lume site on Deno Deploy or a VPS

If you also want ***completion***, as in ***retrieval-augmented completion (RAG)***,
then you will also need to be able to provide a completion model key and 
provider (Featherless, OpenRouter, OpenAI, Anthropic, Etc).

## Current Status

Still in development and not yet functional.
