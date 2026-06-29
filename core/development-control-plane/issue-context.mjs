import { spawnSync } from "node:child_process";

import { failClosed } from "./fail-closed.mjs";

const REQUIRED_ISSUE_FIELDS = ["body", "labels", "comments", "title", "url"];

function asArray(value, fieldName) {
  if (!Array.isArray(value)) {
    throw failClosed(`live GitHub issue field ${fieldName} must be an array`, { fieldName });
  }
  return value;
}

function normalizeLabels(labels) {
  return asArray(labels, "labels").map((label) => {
    if (typeof label === "string") return label;
    if (label && typeof label.name === "string") return label.name;
    throw failClosed("live GitHub issue labels must be strings or objects with name", { label });
  });
}

export function normalizeComments(comments) {
  return asArray(comments, "comments").map((comment) => {
    if (typeof comment === "string") {
      return { body: comment, author: null, createdAt: null };
    }
    if (!comment || typeof comment.body !== "string") {
      throw failClosed("live GitHub issue comments must include body", { comment });
    }
    return {
      body: comment.body,
      author:
        typeof comment.author?.login === "string"
          ? comment.author.login
          : typeof comment.author === "string"
            ? comment.author
            : null,
      createdAt: typeof comment.createdAt === "string" ? comment.createdAt : null,
    };
  });
}

export function ddalggakIssueContextFromGhJson(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw failClosed("live GitHub issue payload must be an object");
  }
  const missing = REQUIRED_ISSUE_FIELDS.filter((field) => !(field in payload));
  if (missing.length > 0) {
    throw failClosed("live GitHub issue payload is missing required fields", { missing });
  }
  if (typeof payload.body !== "string" || payload.body.trim() === "") {
    throw failClosed("live GitHub issue body is required before worker dispatch");
  }
  if (typeof payload.title !== "string" || payload.title.trim() === "") {
    throw failClosed("live GitHub issue title is required before worker dispatch");
  }
  if (typeof payload.url !== "string" || !payload.url.includes("/issues/")) {
    throw failClosed("live GitHub issue url is required before worker dispatch");
  }

  return {
    number: payload.number ?? null,
    title: payload.title,
    url: payload.url,
    body: payload.body,
    labels: normalizeLabels(payload.labels),
    comments: normalizeComments(payload.comments),
  };
}

export function fetchGhIssueViewJson(issueRef, { repo, ghCommand = "gh" } = {}) {
  if (!issueRef) {
    throw failClosed("issue reference is required");
  }
  const args = ["issue", "view", String(issueRef), "--json", "body,labels,comments,title,url,number"];
  if (repo) {
    args.push("--repo", repo);
  }
  const result = spawnSync(ghCommand, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw failClosed("gh issue view failed before worker dispatch", {
      status: result.status,
      stderr: result.stderr.trim(),
    });
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw failClosed("gh issue view returned invalid JSON", { message: error.message });
  }
}
