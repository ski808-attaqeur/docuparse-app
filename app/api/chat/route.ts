import { NextRequest, NextResponse } from "next/server";
import { retrieve } from "@/lib/retrieve";
import { answerQuestion } from "@/lib/ai";
import { adminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * RAG Q&A (FR-15/FR-16). Retrieve top passages, answer with the AI when a key
 * is present, otherwise return an extractive answer built from the best passage.
 * Every answer carries citations (document + page); never fabricates a source.
 */
export async function POST(req: NextRequest) {
  let body: { question?: string; scope?: "document" | "corpus"; document_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON body" }, { status: 400 });
  }
  const question = body.question?.trim();
  if (!question) return NextResponse.json({ error: "question required" }, { status: 400 });

  const hits = await retrieve(question, {
    documentId: body.scope === "document" ? body.document_id : undefined,
    limit: 5,
  });

  if (!hits.length) {
    return NextResponse.json({
      answer: "I couldn't find anything about that in the documents.",
      citations: [],
    });
  }

  const context = hits.map((h) => ({
    document_id: h.document_id,
    page: h.page,
    filename: h.filename,
    content: h.snippet,
  }));

  const aiAnswer = await answerQuestion(question, context);
  const answer =
    aiAnswer ??
    `Based on ${hits[0].filename} (page ${hits[0].page}): ${hits[0].snippet}`;

  const citations = hits.slice(0, 3).map((h) => ({
    document_id: h.document_id,
    page: h.page,
    filename: h.filename,
  }));

  // Best-effort persist the exchange (non-fatal).
  try {
    const db = adminClient();
    const { data: session } = await db
      .from("chat_sessions")
      .insert({
        title: question.slice(0, 60),
        scope: body.scope ?? "corpus",
        scope_document_id: body.scope === "document" ? body.document_id : null,
      })
      .select("id")
      .single();
    if (session) {
      await db.from("chat_messages").insert([
        { session_id: session.id, role: "user", content: question, citations: null },
        { session_id: session.id, role: "assistant", content: answer, citations },
      ]);
    }
  } catch {
    /* chat history is optional */
  }

  return NextResponse.json({ answer, citations, ai: !!aiAnswer });
}
