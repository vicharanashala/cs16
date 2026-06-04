const FAQ = require('../models/FAQ');
const Query = require('../models/Query');
const Answer = require('../models/Answer');

// ─── Tokenizer (same as searchController — not exported, so copied here) ──────

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these',
  'those', 'it', 'its', 'as', 'if', 'then', 'than', 'so', 'no', 'not',
  'only', 'just', 'also', 'very', 'how', 'what', 'when', 'where', 'which',
  'who', 'whom', 'whose', 'why', 'whether', 'am', 'i', 'we', 'you', 'your',
  'he', 'she', 'they', 'them', 'his', 'her', 'their', 'my', 'our'
]);

function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOPWORDS.has(t));
}

// ─── BM25 parameters ─────────────────────────────────────────────────────────

const K1 = 1.5;
const B = 0.75;

function rsjIdf(df, N) {
  return Math.log((N - df + 0.5) / (df + 0.5) + 1);
}

function bm25Score(queryTokens, docTokens, docLen, avgDL, df, N) {
  const docTf = {};
  for (const t of docTokens) docTf[t] = (docTf[t] || 0) + 1;
  let score = 0;
  for (const term of queryTokens) {
    const termDf = df[term] || 0;
    if (termDf === 0) continue;
    const wIdf = rsjIdf(termDf, N);
    const tf = docTf[term] || 0;
    const numerator = tf * (K1 + 1);
    const denominator = tf + K1 * (1 - B + B * (docLen / avgDL));
    score += wIdf * (numerator / denominator);
  }
  return score;
}

// ─── Semantic Cache ──────────────────────────────────────────────────────────

async function getOllamaEmbedding(text) {
  const baseUrl = (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, '');
  const model = process.env.OLLAMA_MODEL || 'llama3';
  try {
    const res = await fetch(`${baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: text })
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.embedding;
  } catch (err) {
    console.warn('[Embedding] Failed to generate Ollama embedding:', err.message);
    return null;
  }
}

function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

const RAG_CACHE_CAP = 150; // light-weight process foot-print to avoid heavy memory consumption
const semanticCache = new Map(); // maps lowercased query string to { answer: string, sources: Array, faqsFound: number, timestamp: number }
const MAX_CACHE_SIZE = RAG_CACHE_CAP;
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours TTL

function cleanExpiredCache() {
  const now = Date.now();
  for (const [cachedQuery, entry] of semanticCache.entries()) {
    if (entry.timestamp && now - entry.timestamp > CACHE_TTL_MS) {
      semanticCache.delete(cachedQuery);
    }
  }
}

// Simple Jaccard similarity between two token arrays
function jaccardSimilarity(tokensA, tokensB) {
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  const union = new Set([...setA, ...setB]);
  let intersectionCount = 0;
  for (const item of setA) {
    if (setB.has(item)) intersectionCount++;
  }
  return intersectionCount / union.size;
}

// Find a matching response in cache using fast semantic overlap
function getSemanticCache(query) {
  cleanExpiredCache(); // Evict any expired entries periodically on lookup
  
  const qTokens = tokenize(query);
  if (qTokens.length === 0) return null;
  
  // 1. Check exact string match (case-insensitive)
  const exactKey = query.toLowerCase().trim();
  if (semanticCache.has(exactKey)) {
    console.log(`[RAG Cache] Exact cache hit for query: "${query}"`);
    return semanticCache.get(exactKey);
  }

  // 2. Iterate cache keys to find high token overlap similarity (Jaccard similarity >= 0.85)
  for (const [cachedQuery, entry] of semanticCache.entries()) {
    const cachedTokens = tokenize(cachedQuery);
    const sim = jaccardSimilarity(qTokens, cachedTokens);
    if (sim >= 0.85) {
      console.log(`[RAG Cache] Semantic cache hit for: "${query}" (similarity: ${sim.toFixed(2)} with cached: "${cachedQuery}")`);
      return entry;
    }
  }
  return null;
}

function setSemanticCache(query, entry) {
  cleanExpiredCache(); // Clean up before inserting new items
  
  if (semanticCache.size >= MAX_CACHE_SIZE) {
    // Evict oldest item
    const firstKey = semanticCache.keys().next().value;
    semanticCache.delete(firstKey);
  }
  entry.timestamp = Date.now(); // Store entry with a timestamp property
  semanticCache.set(query.toLowerCase().trim(), entry);
}


// ─── Ollama availability check ───────────────────────────────────────────────

let ollamaAvailable = null; // null = unknown, true = available, false = unavailable

async function isOllamaAvailable() {
  if (ollamaAvailable !== null) return ollamaAvailable;
  const baseUrl = (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, '');
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000); // 3 seconds timeout is plenty
    const res = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal });
    clearTimeout(timeout);
    ollamaAvailable = res.ok;
  } catch {
    ollamaAvailable = false;
  }
  return ollamaAvailable;
}

// ─── Ollama validation (only called if Ollama is confirmed available) ──────────

async function validateAnswer(title, answer) {
  const baseUrl = (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, '');
  const model = process.env.OLLAMA_MODEL || 'llama3';
  const prompt = `Does the answer contain real information (not placeholder text)? Yes or No only.\nQuestion: ${title}\nAnswer: ${answer}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000); 

  try {
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!response.ok) return false;
    const data = await response.json();
    const r = (data.response || '').toLowerCase().trim();
    return r === 'yes' || r === 'yes.';
  } catch {
    clearTimeout(timeout);
    return false;
  }
}

// ─── Background Validation Sweeper ──────────────────────────────────────────

let isValidatingBackground = false;

async function triggerBackgroundValidation(pendingFaqs) {
  if (isValidatingBackground) return;
  isValidatingBackground = true;

  // Run in a fully asynchronous, non-blocking execution cycle
  setImmediate(async () => {
    try {
      const ollamaOk = await isOllamaAvailable();
      if (!ollamaOk) {
        isValidatingBackground = false;
        return;
      }

      console.log(`[RAG Background] Validating ${pendingFaqs.length} newly added or unvalidated FAQs...`);
      for (const faq of pendingFaqs) {
        try {
          const isValid = await validateAnswer(faq.title, faq.finalAnswer || '');
          await FAQ.updateOne(
            { _id: faq._id },
            { $set: { isValidated: isValid } }
          );
          console.log(`[RAG Background] FAQ "${faq.title}" validation outcome: ${isValid ? 'PASSED' : 'FAILED'}`);
        } catch (e) {
          console.warn(`[RAG Background] Validation error for FAQ ${faq._id}:`, e.message);
        }
        // Controlled spacing delay to avoid choking local Ollama instance
        await new Promise(r => setTimeout(r, 600));
      }

      // Clear the cache to rebuild the index including new validated statuses
      ragCache = null;
      console.log('[RAG Background] Completed sweep. Cleared in-memory index cache for dynamic rebuild.');
    } catch (err) {
      console.error('[RAG Background] Critical background validation failure:', err.message);
    } finally {
      isValidatingBackground = false;
    }
  });
}

// ─── RAG Index (in-memory, refreshed every 10 min) ──────────────────────────

const RAG_TTL_MS = 10 * 60 * 1000;
let ragCache = null;
let ragCacheAt = 0;

async function buildRagIndex() {
  if (ragCache && Date.now() - ragCacheAt < RAG_TTL_MS) return ragCache;
  const ollamaOk = await isOllamaAvailable();

  // 1. Fetch resolved FAQs from database
  const faqs = await FAQ.find({
    status: 'resolved',
    deletedAt: null,
    finalAnswer: { $type: 'string', $ne: '' }
  }).select('title finalAnswer tags upvotes isValidated embedding').lean();

  // 2. Fetch resolved community queries and their accepted answers
  const resolvedQueries = await Query.find({
    status: { $in: ['closed', 'answered'] },
    deletedAt: null
  }).select('_id title description tags upvotes embedding').lean();

  const communityFaqs = [];
  for (const q of resolvedQueries) {
    const acceptedAns = await Answer.findOne({ queryId: q._id, isAccepted: true, deletedAt: null })
      .populate('userId', 'name')
      .lean();
    if (acceptedAns && acceptedAns.content) {
      communityFaqs.push({
        _id: q._id,
        title: q.title,
        description: q.description || '',
        finalAnswer: acceptedAns.content,
        tags: q.tags,
        upvotes: q.upvotes || 0,
        isValidated: true,
        isCommunity: true,
        embedding: q.embedding
      });
    }
  }

  const allCorpus = [...faqs, ...communityFaqs];

  if (allCorpus.length === 0) {
    ragCache = { faqs: [], df: {}, N: 0 };
    ragCacheAt = Date.now();
    return ragCache;
  }

  // 3. Separate into validated list and unvalidated list for background validation
  const validatedFaqs = [];
  const pendingValidation = [];

  for (const faq of allCorpus) {
    if (faq.isValidated === true) {
      validatedFaqs.push(faq);
    } else if (faq.isValidated === false) {
      // Explicitly failed LLM placeholder validation — filter out to preserve quality!
    } else {
      // Legacy or fresh entries without a validation state
      // We include them instantly for full availability but queue them for background LLM check!
      validatedFaqs.push(faq);
      pendingValidation.push(faq);
    }
  }

  // 4. Fire background worker only for non-community FAQs that need verification
  const pendingFaqsOnly = pendingValidation.filter(item => !item.isCommunity);
  if (pendingFaqsOnly.length > 0) {
    triggerBackgroundValidation(pendingFaqsOnly);
  }

  // Calculate missing embeddings in background
  if (ollamaOk) {
    for (const faq of validatedFaqs) {
      if (!faq.embedding || faq.embedding.length === 0) {
        const textToEmbed = `${faq.title} ${faq.isCommunity ? faq.description || '' : faq.finalAnswer || ''}`.substring(0, 1000);
        getOllamaEmbedding(textToEmbed).then(emb => {
          if (emb) {
            faq.embedding = emb;
            if (faq.isCommunity) {
              Query.updateOne({ _id: faq._id }, { $set: { embedding: emb } }).catch(e => console.warn('Failed background Query embedding save:', e.message));
            } else {
              FAQ.updateOne({ _id: faq._id }, { $set: { embedding: emb } }).catch(e => console.warn('Failed background FAQ embedding save:', e.message));
            }
          }
        }).catch(err => console.warn('Failed background embedding generation:', err.message));
      }
    }
  }

  if (validatedFaqs.length === 0) {
    ragCache = { faqs: [], df: {}, N: 0 };
    ragCacheAt = Date.now();
    return ragCache;
  }

  // Document frequency across validated FAQ corpus
  const df = {};
  for (const faq of validatedFaqs) {
    const contentText = faq.isCommunity
      ? `${faq.description || ''}\n\n${faq.finalAnswer || ''}`
      : faq.finalAnswer || '';
    const text = `${faq.title} ${contentText}`.toLowerCase();
    for (const term of new Set(tokenize(text))) {
      df[term] = (df[term] || 0) + 1;
    }
  }

  ragCache = {
    faqs: validatedFaqs.map(f => {
      const contentText = f.isCommunity
        ? `${f.description || ''}\n\n${f.finalAnswer || ''}`
        : f.finalAnswer || '';
      return {
        _id: f._id,
        title: f.title,
        content: contentText,
        tags: f.tags,
        upvotes: f.upvotes,
        embedding: f.embedding,
        _tokens: tokenize(`${f.title} ${contentText}`),
        _docLen: tokenize(`${f.title} ${contentText}`).length
      };
    }),
    df,
    N: validatedFaqs.length
  };
  ragCacheAt = Date.now();
  return ragCache;
}

// ─── Ollama streaming call ───────────────────────────────────────────────────

async function askOllamaStream(question, context, onChunk, externalSignal) {
  const baseUrl = (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, '');
  const model = process.env.OLLAMA_MODEL || 'llama3';

  const prompt = `You are a helpful university FAQ assistant. Answer the user's question based ONLY on the provided FAQ context. If the context doesn't contain a sufficient answer, say you couldn't find a clear answer and suggest the user ask the community.

CONTEXT:
${context}

QUESTION: ${question}

INSTRUCTIONS:
- Answer based strictly on the context provided above
- Be concise and helpful (2-4 sentences normally)
- If the context doesn't have a clear answer, say so honestly
- Do NOT make up information
- Format your response with bullet points if it helps

ANSWER (only reference FAQ titles, never say "FAQ 1", "FAQ 2", etc.):`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', () => {
        controller.abort();
      });
    }
  }

  try {
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: true }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Ollama error ${response.status}: ${err}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); 
      for (const line of lines) {
        if (!line.trim() || !line.startsWith('{')) continue;
        try {
          const chunk = JSON.parse(line);
          if (chunk.response) onChunk(chunk.response);
        } catch { /* skip malformed lines */ }
      }
    }
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') throw new Error('Request timed out. Please try again.');
    throw err;
  }
}

// ─── Route handler ───────────────────────────────────────────────────────────

exports.buildRagIndex = buildRagIndex;

exports.ragChat = async (req, res) => {
  const abortController = new AbortController();

  // Gracefully handle client connection close/abort to terminate LLM streams instantly
  req.on('close', () => {
    if (!abortController.signal.aborted) {
      console.log('[RAG] Client request closed early. Aborting active Ollama generation fetch stream...');
      abortController.abort();
    }
  });

  try {
    const { question } = req.body;

    if (!question || typeof question !== 'string' || question.trim().length < 3) {
      return res.status(400).json({ error: 'Question must be at least 3 characters' });
    }

    const q = question.trim();

    // ─────────────────────────────────────────────────────────────────────────
    // EXPERIMENT 2: Semantic Cache Check (Sub-millisecond Retrieval)
    // ─────────────────────────────────────────────────────────────────────────
    const cachedResponse = getSemanticCache(q);
    if (cachedResponse) {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Transfer-Encoding', 'chunked');
      res.setHeader('X-Content-Type-Options', 'nosniff');

      // Send identical sources list instantly
      res.write(JSON.stringify({ sources: cachedResponse.sources, faqsFound: cachedResponse.faqsFound }) + '\n');

      // Stream cached content back in lightning-fast mock-typing chunks
      const words = cachedResponse.answer.split(/(\s+)/);
      for (const word of words) {
        if (!word) continue;
        res.write(JSON.stringify({ token: word }) + '\n');
        await new Promise(resolve => setTimeout(resolve, 3)); // 3ms interval is imperceptible
      }

      res.write(JSON.stringify({ done: true }) + '\n');
      res.end();
      return;
    }

    // 1. Retrieve top-k relevant FAQs using Hybrid Search (Vector + BM25)
    const { faqs, df, N } = await buildRagIndex();

    if (faqs.length === 0) {
      return res.json({
        answer: "There are no FAQs in the system yet. Be the first to ask!",
        sources: [],
        faqsFound: 0
      });
    }

    const qTokens = tokenize(q);
    const avgDL = faqs.reduce((s, f) => s + f._docLen, 0) / faqs.length;

    let scored = [];
    const ollamaOk = await isOllamaAvailable();
    let queryEmbedding = null;
    if (ollamaOk) {
      queryEmbedding = await getOllamaEmbedding(q);
    }

    if (queryEmbedding) {
      scored = faqs
        .map(faq => {
          const sim = cosineSimilarity(queryEmbedding, faq.embedding);
          const vectorScore = sim > 0 ? sim * 5.0 : 0;
          return { ...faq, score: vectorScore, similarity: sim };
        })
        .filter(f => f.score >= 1.2)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
    } else {
      scored = faqs
        .map(faq => ({ ...faq, score: bm25Score(qTokens, faq._tokens, faq._docLen, avgDL, df, N) }))
        .filter(f => f.score >= 1.2)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
    }

    const sources = scored.map(f => ({
      _id: f._id,
      title: f.title,
      content: f.content,
      score: Math.round(f.score * 1000) / 1000
    }));

    // Increment viewCount on FAQs shown as sources
    const sourceIds = scored.map(f => f._id);
    if (sourceIds.length > 0) {
      FAQ.updateMany(
        { _id: { $in: sourceIds } },
        { $inc: { viewCount: 1 }, $set: { lastViewed: new Date() } }
      ).catch(err => console.warn('Failed to increment FAQ viewCount:', err.message));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // EXPERIMENT 1: High-Confidence Short-Circuit Routing (Instantaneous Symbolic Shortcut)
    // ─────────────────────────────────────────────────────────────────────────
    let canShortCircuit = false;
    const topFaq = scored[0];

    if (topFaq && topFaq.score >= 3.0) { // Raised score threshold from 2.5 to 3.0
      // Calculate how many distinct query terms actually match the FAQ document
      const queryTermsInDoc = qTokens.filter(t => topFaq._tokens.includes(t)).length;
      
      if (qTokens.length === 1) {
        // Single term queries need a very high BM25 match score
        canShortCircuit = topFaq.score >= 3.5;
      } else if (qTokens.length >= 2) {
        // Multi-term queries require at least 2 distinct tokens to match to block single-word coincidences
        canShortCircuit = queryTermsInDoc >= 2;
      }
    }

    if (canShortCircuit && topFaq) {
      console.log(`[RAG Short-Circuit] Verified high-confidence match: "${topFaq.title}" (score: ${topFaq.score.toFixed(2)}, matching terms: ${qTokens.filter(t => topFaq._tokens.includes(t)).join(', ')})`);
      
      const responseText = `Here is the resolved FAQ response matching your query:\n\n**${topFaq.title}**\n${topFaq.content}\n\n`;

      // Save complete entry to Jaccard Semantic Cache
      setSemanticCache(q, {
        answer: responseText,
        sources,
        faqsFound: scored.length
      });

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Transfer-Encoding', 'chunked');
      res.setHeader('X-Content-Type-Options', 'nosniff');

      res.write(JSON.stringify({ sources, faqsFound: scored.length }) + '\n');

      const words = responseText.split(/(\s+)/);
      for (const word of words) {
        if (!word) continue;
        res.write(JSON.stringify({ token: word }) + '\n');
        await new Promise(resolve => setTimeout(resolve, 4)); // fast 4ms delay
      }

      res.write(JSON.stringify({ done: true }) + '\n');
      res.end();
      return;
    }

    // 2. Build context string from top FAQs
    const context = scored.length
      ? scored.map(f => `**${f.title}**\n${f.content}`).join('\n\n')
      : 'No relevant FAQs found for this question.';

    // ollamaOk is already defined at top of ragChat
    if (!ollamaOk) {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Transfer-Encoding', 'chunked');
      res.setHeader('X-Content-Type-Options', 'nosniff');

      res.write(JSON.stringify({ sources, faqsFound: scored.length }) + '\n');

      let responseText = '';
      if (scored.length > 0) {
        const topFaq = scored[0];
        responseText = `I searched Grantha resolved FAQs and found a highly relevant match for your query:\n\n**${topFaq.title}**\n${topFaq.content}\n\n`;
        if (scored.length > 1) {
          responseText += `You can also check out these related topics:\n`;
          scored.slice(1, 3).forEach(f => {
            responseText += `• **${f.title}**\n`;
          });
        }
      } else {
        responseText = `I searched Grantha FAQs but couldn't find a direct match. You can raise a new query in the community and a peer or mentor will answer it soon!`;
      }

      // ───────────────────────────────────────────────────────────────────────
      // EXPERIMENT 3: Dynamic Fallback Streaming (Ultra-responsive Mock Typing)
      // ───────────────────────────────────────────────────────────────────────
      const words = responseText.split(/(\s+)/);
      for (const word of words) {
        if (!word) continue;
        res.write(JSON.stringify({ token: word }) + '\n');
        await new Promise(resolve => setTimeout(resolve, 8)); // Accelerated 8ms simulated typing
      }

      res.write(JSON.stringify({ done: true }) + '\n');
      res.end();
      return;
    }

    // 3. Stream answer via Ollama
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    res.write(JSON.stringify({ sources, faqsFound: scored.length }) + '\n');

    let answerText = '';

    await askOllamaStream(q, context, (chunk) => {
      answerText += chunk;
      res.write(JSON.stringify({ token: chunk }) + '\n');
    }, abortController.signal);

    // Save newly generated LLM answer to Semantic Cache
    if (answerText.trim().length > 0) {
      setSemanticCache(q, {
        answer: answerText,
        sources,
        faqsFound: scored.length
      });
    }

    // Signal completion
    res.write(JSON.stringify({ done: true }) + '\n');
    res.end();
  } catch (error) {
    console.error('RAG chat error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate answer', message: error.message });
    } else {
      res.write(JSON.stringify({ error: error.message }) + '\n');
      res.end();
    }
  }
};

async function generateRagAnswerText(question) {
  try {
    const q = question.trim();
    const { faqs, df, N } = await buildRagIndex();
    if (faqs.length === 0) {
      return "I searched the knowledge base but couldn't find any relevant FAQs. A community member will respond shortly!";
    }

    const qTokens = tokenize(q);
    const avgDL = faqs.reduce((s, f) => s + f._docLen, 0) / faqs.length;

    let scored = [];
    const ollamaOk = await isOllamaAvailable();
    let queryEmbedding = null;
    if (ollamaOk) {
      queryEmbedding = await getOllamaEmbedding(q);
    }

    if (queryEmbedding) {
      scored = faqs
        .map(faq => {
          const sim = cosineSimilarity(queryEmbedding, faq.embedding);
          const vectorScore = sim > 0 ? sim * 5.0 : 0;
          return { ...faq, score: vectorScore, similarity: sim };
        })
        .filter(f => f.score >= 1.2)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
    } else {
      scored = faqs
        .map(faq => ({ ...faq, score: bm25Score(qTokens, faq._tokens, faq._docLen, avgDL, df, N) }))
        .filter(f => f.score >= 1.2)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
    }

    if (scored.length === 0) {
      return "I searched the knowledge base but couldn't find a direct match. A community member will respond shortly!";
    }

    const topFaq = scored[0];
    // ollamaOk is already defined at top of generateRagAnswerText
    if (ollamaOk) {
      const context = scored.map(f => `**${f.title}**\n${f.content}`).join('\n\n');
      const baseUrl = (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, '');
      const model = process.env.OLLAMA_MODEL || 'llama3';
      const prompt = `You are a helpful university FAQ assistant. Answer the user's question based ONLY on the provided FAQ context. If the context doesn't contain a sufficient answer, say you couldn't find a clear answer. Be concise (2-4 sentences).

CONTEXT:
${context}

QUESTION: ${q}

ANSWER:`;

      try {
        const response = await fetch(`${baseUrl}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, prompt, stream: false })
        });
        if (response.ok) {
          const data = await response.json();
          if (data.response && data.response.trim().length > 10) {
            return data.response.trim();
          }
        }
      } catch (err) {
        console.warn('Background Ollama generation failed:', err.message);
      }
    }

    return `Based on the FAQ knowledge base:\n\n**${topFaq.title}**\n${topFaq.content}`;
  } catch (err) {
    console.error('generateRagAnswerText error:', err);
    return 'Failed to generate automatic RAG answer.';
  }
}

exports.generateRagAnswerText = generateRagAnswerText;

exports.clearRagCache = () => {
  ragCache = null;
  ragCacheAt = 0;
};

async function linkQuerySemanticGraph(queryId) {
  try {
    const query = await Query.findById(queryId);
    if (!query) return;

    const { faqs } = await buildRagIndex();
    if (faqs.length === 0) return;

    const qTokens = tokenize(query.title);
    if (qTokens.length === 0) return;

    const avgDL = faqs.reduce((s, f) => s + f._docLen, 0) / faqs.length;
    
    const scored = faqs
      .filter(f => f._id.toString() !== query._id.toString())
      .map(faq => {
        const tf = {};
        for (const t of faq._tokens) tf[t] = (tf[t] || 0) + 1;
        
        let score = 0;
        for (const term of qTokens) {
          const tfVal = tf[term] || 0;
          if (tfVal === 0) continue;
          const tfPart = tfVal * (1.5 + 1) / (tfVal + 1.5 * (1 - 0.75 + 0.75 * (faq._docLen / avgDL)));
          score += tfPart;
        }
        return { _id: faq._id, score, tags: faq.tags };
      })
      .filter(f => f.score > 0.3)
      .sort((a, b) => b.score - a.score);

    if (scored.length > 0) {
      const related = scored.slice(0, 3).map(f => f._id);
      const suggestedTags = new Set(query.tags || []);
      for (const item of scored.slice(0, 5)) {
        if (item.tags) {
          item.tags.forEach(t => {
            if (!t.startsWith('from-community-')) {
              suggestedTags.add(t);
            }
          });
        }
      }
      
      query.relatedQueries = related;
      query.tags = [...suggestedTags].slice(0, 5);
      await query.save();
      console.log(`[Semantic Graph] Linked Query "${query.title}" -> ${related.length} items. Suggested tags: [${query.tags.join(', ')}]`);
    }
  } catch (err) {
    console.error('linkQuerySemanticGraph error:', err);
  }
}

exports.linkQuerySemanticGraph = linkQuerySemanticGraph;

// Export internal variables and functions under test environment to enable clean test coverage
if (process.env.NODE_ENV === 'test') {
  exports.semanticCache = semanticCache;
  exports.getSemanticCache = getSemanticCache;
  exports.setSemanticCache = setSemanticCache;
  exports.cleanExpiredCache = cleanExpiredCache;
  exports.CACHE_TTL_MS = CACHE_TTL_MS;
}

