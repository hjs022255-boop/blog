const {
  fetchPostById,
  getPathParam,
  methodNotAllowed,
  savePostById,
  sendJson
} = require("../../../_lib/firebase");

module.exports = async (req, res) => {
  const postId = getPathParam(req.query.postId);
  const commentId = getPathParam(req.query.commentId);

  if (!postId || !commentId) {
    sendJson(res, 400, { message: "댓글 ID가 올바르지 않아요." });
    return;
  }

  if (req.method !== "DELETE") {
    methodNotAllowed(res);
    return;
  }

  try {
    const existing = await fetchPostById(postId);
    if (!existing) {
      sendJson(res, 404, { message: "댓글 삭제할 글을 찾지 못했어요." });
      return;
    }

    const hasComment = (existing.comments || []).some((item) => item.id === commentId);
    if (!hasComment) {
      sendJson(res, 404, { message: "삭제할 댓글을 찾지 못했어요." });
      return;
    }

    const now = new Date().toISOString();
    const updated = {
      title: existing.title,
      content: existing.content,
      imageDataUrl: existing.imageDataUrl || "",
      createdAt: existing.createdAt || now,
      updatedAt: now,
      likes: existing.likes || 0,
      comments: (existing.comments || []).filter((item) => item.id !== commentId)
    };

    await savePostById(postId, updated);
    sendJson(res, 200, { success: true });
  } catch (error) {
    sendJson(res, error.statusCode || 500, {
      message: error.message || "댓글 삭제 중 문제가 생겼어요."
    });
  }
};
