const {
  fetchPostById,
  getPathParam,
  methodNotAllowed,
  savePostById,
  sendJson
} = require("../../_lib/firebase");

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
    const existing = await fetchPostById(postId);
    if (!existing) {
      sendJson(res, 404, { message: "좋아요를 누를 글을 찾지 못했어요." });
      return;
    }

    const now = new Date().toISOString();
    const updated = {
      title: existing.title,
      content: existing.content,
      imageDataUrl: existing.imageDataUrl || "",
      createdAt: existing.createdAt || now,
      updatedAt: now,
      likes: (existing.likes || 0) + 1,
      comments: existing.comments || []
    };

    await savePostById(postId, updated);
    sendJson(res, 200, { likes: updated.likes });
  } catch (error) {
    sendJson(res, error.statusCode || 500, {
      message: error.message || "좋아요 처리 중 문제가 생겼어요."
    });
  }
};
