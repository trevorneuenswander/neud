const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export type YouTubeVideoIdParse =
  | { ok: true; videoId: string }
  | { ok: false; error: string };

/**
 * Accept a raw video ID or a normal YouTube watch/live/share URL.
 * Returns only the 11-character video ID.
 */
export function parseYouTubeVideoId(input: string): YouTubeVideoIdParse {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, error: "Enter a YouTube live URL or video ID." };
  }
  if (VIDEO_ID.test(trimmed)) {
    return { ok: true, videoId: trimmed };
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    return {
      ok: false,
      error: "That is not a YouTube video ID or a YouTube live URL.",
    };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return {
      ok: false,
      error: "That is not a YouTube video ID or a YouTube live URL.",
    };
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0] ?? "";
    return idResult(id);
  }
  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    const live = url.pathname.match(/^\/live\/([^/]+)/);
    if (live) {
      return idResult(live[1] ?? "");
    }
    if (url.pathname === "/watch") {
      return idResult(url.searchParams.get("v") ?? "");
    }
    return {
      ok: false,
      error: "Paste a YouTube watch or live URL, or an 11-character video ID.",
    };
  }
  return { ok: false, error: "That link is not a YouTube URL." };
}

function idResult(id: string): YouTubeVideoIdParse {
  if (VIDEO_ID.test(id)) {
    return { ok: true, videoId: id };
  }
  return { ok: false, error: "That YouTube link does not include a video ID." };
}
