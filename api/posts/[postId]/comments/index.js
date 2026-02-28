const {
  fetchPostById,
  generateId,
  getPathParam,
  methodNotAllowed,
  normalizeBody,
  sanitizeCommentInput,
  savePostById,
  sendJson
} = require("../../../_lib/firebase");

module.exports = async (req, res) => {
  const postId = getPathParam(req.query.postId);
  if (!postId) {
    sendJson(res, 400, { message: "글 ID가 올바르지 않아요." });
    return;
  }

  if (req.method !== "POST") {
    methodNotAllowed(res);
    return;
  }

  try {
    const body = normalizeBody(req.body);
    const commentInput = sanitizeCommentInput(body);
    if (commentInput.error) {
      sendJson(res, 400, { message: commentInput.error });
      return;
    }

    const existing = await fetchPostById(postId);
    if (!existing) {
      sendJson(res, 404, { message: "댓글 달 글을 찾지 못했어요." });
      return;
    }

    const now = new Date().toISOString();
    const newComment = {
      id: generateId(),
      text: commentInput.text,
      createdAt: now
    };

    const updated = {
      title: existing.title,
      content: existing.content,
      imageDataUrl: existing.imageDataUrl || "",
      createdAt: existing.createdAt || now,
      updatedAt: now,
      likes: existing.likes || 0,
      comments: [...(existing.comments || []), newComment]
    };

    await savePostById(postId, updated);
    sendJson(res, 201, { comment: newComment });
  } catch (error) {
    sendJson(res, error.statusCode || 500, {
      message: error.message || "댓글 등록 중 문제가 생겼어요."
    });
  }
};
