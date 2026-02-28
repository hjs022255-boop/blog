const FIREBASE_WEB_API_KEY =
  process.env.FIREBASE_WEB_API_KEY ||
  process.env.FIREBASE_API_KEY ||
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
  process.env.VITE_FIREBASE_API_KEY ||
  "AIzaSyCaPRkCOvcNpTHqDOdlMhRAojyZoq9q1RU";
const AUTH_LOGIN_URL =
  process.env.AUTH_LOGIN_URL ||
  process.env.LOGIN_API_URL ||
  process.env.FIREBASE_LOGIN_URL ||
  "";
const REQUEST_TIMEOUT_MS = 10_000;

function sendJson(res, statusCode, data) {
  res.status(statusCode).json(data);
}

function normalizeBody(rawBody) {
  if (!rawBody) {
    return {};
  }
  if (typeof rawBody === "object") {
    return rawBody;
  }
  if (typeof rawBody === "string") {
    try {
      return JSON.parse(rawBody);
    } catch (error) {
      return {};
    }
  }
  return {};
}

function sanitizeLoginInput(body) {
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) {
    return { error: "이메일과 비밀번호를 입력해줘." };
  }
  return { email, password };
}

async function requestWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    sendJson(res, 405, { message: "지원하지 않는 요청 방식이에요." });
    return;
  }

  try {
    const body = normalizeBody(req.body);
    const input = sanitizeLoginInput(body);
    if (input.error) {
      sendJson(res, 400, { message: input.error });
      return;
    }

    if (AUTH_LOGIN_URL) {
      const response = await requestWithTimeout(AUTH_LOGIN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        sendJson(res, 200, {
          success: false,
          message: data.message || "로그인에 실패했어."
        });
        return;
      }
      sendJson(res, 200, {
        success: true,
        token: data.token || data.idToken || "",
        user: data.user || { email: input.email }
      });
      return;
    }

    if (!FIREBASE_WEB_API_KEY) {
      sendJson(res, 200, {
        success: false,
        message: "로그인 설정이 아직 준비되지 않았어."
      });
      return;
    }

    const firebaseUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(
      FIREBASE_WEB_API_KEY
    )}`;
    const firebaseResponse = await requestWithTimeout(firebaseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: input.email,
        password: input.password,
        returnSecureToken: true
      })
    });

    const firebaseData = await firebaseResponse.json().catch(() => ({}));
    if (!firebaseResponse.ok) {
      const reason =
        firebaseData &&
        firebaseData.error &&
        typeof firebaseData.error.message === "string"
          ? firebaseData.error.message
          : "";

      if (reason === "INVALID_LOGIN_CREDENTIALS" || reason === "EMAIL_NOT_FOUND") {
        const signUpUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(
          FIREBASE_WEB_API_KEY
        )}`;
        const signUpResponse = await requestWithTimeout(signUpUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: input.email,
            password: input.password,
            returnSecureToken: true
          })
        });
        const signUpData = await signUpResponse.json().catch(() => ({}));

        if (signUpResponse.ok) {
          sendJson(res, 200, {
            success: true,
            token: signUpData.idToken || "",
            refreshToken: signUpData.refreshToken || "",
            user: {
              email: signUpData.email || input.email,
              localId: signUpData.localId || ""
            }
          });
          return;
        }

        const signUpReason =
          signUpData &&
          signUpData.error &&
          typeof signUpData.error.message === "string"
            ? signUpData.error.message
            : "";

        if (signUpReason === "EMAIL_EXISTS") {
          sendJson(res, 200, {
            success: false,
            message: "이메일 또는 비밀번호가 맞지 않아."
          });
          return;
        }
      }

      if (reason === "OPERATION_NOT_ALLOWED") {
        sendJson(res, 200, {
          success: false,
          message: "Firebase에서 이메일/비밀번호 로그인을 켜줘."
        });
        return;
      }

      sendJson(res, 200, {
        success: false,
        message: "이메일 또는 비밀번호가 맞지 않아."
      });
      return;
    }

    sendJson(res, 200, {
      success: true,
      token: firebaseData.idToken || "",
      refreshToken: firebaseData.refreshToken || "",
      user: {
        email: firebaseData.email || input.email,
        localId: firebaseData.localId || ""
      }
    });
  } catch (error) {
    if (error && error.name === "AbortError") {
      sendJson(res, 200, {
        success: false,
        message: "로그인 서버 응답이 늦어."
      });
      return;
    }
    sendJson(res, 200, {
      success: false,
      message: "로그인 처리 중 문제가 생겼어."
    });
  }
};
