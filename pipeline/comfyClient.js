// ===============================================
// comfyClient.js - generic ComfyUI HTTP API client
// queue prompts, poll history, upload/read files locally.
// ===============================================

import axios from "axios";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import FormData from "form-data";
import { config, comfyInputDir, comfyOutputDir } from "./config.js";

const CLIENT_ID = "ai-shorts-" + crypto.randomBytes(4).toString("hex");

/**
 * queuePrompt - submit a workflow (API JSON format) to ComfyUI.
 * @param {object} workflow - node graph in /prompt API format
 * @returns {Promise<string>} prompt_id
 */
export async function queuePrompt(workflow) {
  const res = await axios.post(
    `${config.comfyUrl}/prompt`,
    { prompt: workflow, client_id: CLIENT_ID },
    { timeout: 30000 }
  );
  if (res.data?.error) {
    throw new Error(`ComfyUI rejected workflow: ${JSON.stringify(res.data.error)}`);
  }
  if (!res.data?.prompt_id) throw new Error("ComfyUI: pas de prompt_id retourne");
  return res.data.prompt_id;
}

/**
 * waitForCompletion - poll /history until the job finishes (success or error).
 * @param {string} promptId
 * @param {{timeoutMs?:number, pollMs?:number}} [opts]
 * @returns {Promise<object>} history entry { outputs, status }
 */
export async function waitForCompletion(promptId, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? config.comfyTimeoutMs;
  const pollMs = opts.pollMs ?? config.comfyPollMs;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const res = await axios.get(`${config.comfyUrl}/history/${promptId}`, { timeout: 15000 });
    const entry = res.data?.[promptId];
    if (entry) {
      const status = entry.status;
      if (status?.completed === true) return entry;
      if (status?.status_str === "error" || (Array.isArray(status?.messages) && status.messages.some((m) => m[0] === "execution_error"))) {
        throw new Error(`ComfyUI job ${promptId} a echoue: ${JSON.stringify(status)}`);
      }
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(`ComfyUI job ${promptId} timeout apres ${timeoutMs}ms`);
}

/**
 * extractOutputFiles - list saved files (images/videos) from a history entry.
 * @param {object} historyEntry
 * @returns {Array<{filename:string, subfolder:string, type:string}>}
 */
export function extractOutputFiles(historyEntry) {
  const out = [];
  const outputs = historyEntry?.outputs || {};
  for (const nodeOutputs of Object.values(outputs)) {
    for (const key of ["images", "videos", "gifs"]) {
      if (Array.isArray(nodeOutputs[key])) {
        for (const f of nodeOutputs[key]) {
          out.push({ filename: f.filename, subfolder: f.subfolder || "", type: f.type || "output" });
        }
      }
    }
  }
  return out;
}

/**
 * resolveLocalPath - absolute filesystem path for a ComfyUI output file.
 * Local install -> read directly from disk instead of HTTP /view.
 */
export function resolveLocalPath({ filename, subfolder, type }) {
  const base = type === "input" ? comfyInputDir() : comfyOutputDir();
  return subfolder ? path.join(base, subfolder, filename) : path.join(base, filename);
}

/**
 * uploadImage - copy a local image into ComfyUI's input folder via its API.
 * @param {string} filePath - absolute path to image file
 * @returns {Promise<string>} filename as known to ComfyUI (use in LoadImage)
 */
export async function uploadImage(filePath) {
  const form = new FormData();
  form.append("image", fs.createReadStream(filePath), path.basename(filePath));
  form.append("overwrite", "true");
  const res = await axios.post(`${config.comfyUrl}/upload/image`, form, {
    headers: form.getHeaders(),
    timeout: 60000,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });
  if (!res.data?.name) throw new Error("ComfyUI upload/image: reponse invalide");
  return res.data.name;
}

/**
 * runWorkflow - queue a workflow and wait for its output files.
 * Retries on transient ComfyUI execution errors (e.g. weight-streaming I/O glitches).
 * @param {object} workflow
 * @param {{timeoutMs?:number, retries?:number}} [opts]
 * @returns {Promise<Array<{filename:string, subfolder:string, type:string, path:string}>>}
 */
export async function runWorkflow(workflow, opts = {}) {
  const retries = opts.retries ?? config.maxRetries;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const promptId = await queuePrompt(workflow);
      const entry = await waitForCompletion(promptId, opts);
      const files = extractOutputFiles(entry);
      if (!files.length) throw new Error(`ComfyUI job ${promptId}: aucun fichier de sortie`);
      return files.map((f) => ({ ...f, path: resolveLocalPath(f) }));
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        console.warn(`ComfyUI workflow echoue (tentative ${attempt + 1}/${retries + 1}): ${err.message.split("\n")[0]} -> nouvelle tentative`);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }
  throw lastErr;
}

export default { queuePrompt, waitForCompletion, extractOutputFiles, resolveLocalPath, uploadImage, runWorkflow };
