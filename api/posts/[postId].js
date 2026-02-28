const {
  deletePostById,
  fetchPostById,
  getPathParam,
  methodNotAllowed,
  normalizeBody,
  sanitizePostInput,
  savePostById,
  sendJson
} = require("../_lib/firebase");

module.exports = async (req, res) => {
  const postId = getPathParam(req.query.postId);
  if (!postId) {
    sendJson(res, 400, { message: "글 ID가 올바르지 않아요." });
    return;
  }

  if (req.method === "GET") {
    try {
      const post = await fetchPostById(postId);
      if (!post) {
        sendJson(res, 404, { message: "글을 찾지 못했어요." });
        return;
      }

      sendJson(res, 200, { post });
    } catch (error) {
      sendJson(res, error.statusCode || 500, {
        message: error.message || "글 조회 중 문제가 생겼어요."
      });
    }
    return;
  }

  if (req.method === "PUT") {
    try {
      const body = normalizeBody(req.body);
      const input = sanitizePostInput(body);
      if (input.error) {
        sendJson(res, 400, { message: input.error });
        return;
      }

      const existing = await fetchPostById(postId);
      if (!existing) {
        sendJson(res, 404, { message: "수정할 글을 찾지 못했어요." });
        return;
      }

      const now = new Date().toISOString();
      const updated = {
        title: input.title,
        content: input.content,
        imageDataUrl: input.hasImageField ? input.imageDataUrl : existing.imageDataUrl || "",
        createdAt: existing.createdAt || now,
        updatedAt: now,
        likes: existing.likes || 0,
        comments: existing.comments || []
      };

      await savePostById(postId, updated);
      sendJson(res, 200, { post: { id: postId, ...updated } });
    } catch (error) {
      sendJson(res, error.statusCode || 500, {
        message: error.message || "글 수정 중 문제가 생겼어요."
      });
    }
    return;
  }

  if (req.method === "DELETE") {
    try {
      const existing = await fetchPostById(postId);
      if (!existing) {
        sendJson(res, 404, { message: "삭제할 글을 찾지 못했어요." });
        return;
      }

      await deletePostById(postId);
      sendJson(res, 200, { success: true });
    } catch (error) {
      sendJson(res, error.statusCode || 500, {
        message: error.message || "글 삭제 중 문제가 생겼어요."
      });
    }
    return;
  }

  methodNotAllowed(res);
};
