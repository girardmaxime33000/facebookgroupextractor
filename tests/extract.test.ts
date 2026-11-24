import { describe, expect, it } from "vitest";
import { encodeCommentId, encodeFeedbackId, extractPost } from "../src/facebook/extract.js";
import { PostSchema } from "../src/model/index.js";
import { rawPost } from "./helpers.js";

const ctx = { inputUrl: "https://www.facebook.com/groups/874728723021553" };

describe("extractPost", () => {
  it("produit un Post conforme au schéma de la spec", () => {
    const post = extractPost(rawPost(), ctx);
    expect(() => PostSchema.parse(post)).not.toThrow();
    expect(post.time).toBe("2025-12-10T04:37:15.000Z");
    expect(post.url).toBe("https://www.facebook.com/groups/874728723021553/permalink/1223750702961359/");
    expect(post.facebookUrl).toBe("https://www.facebook.com/groups/874728723021553");
    expect(post.likesCount).toBe(12);
    expect(post.reactionLikeCount).toBe(10);
    expect(post.reactionLoveCount).toBe(2);
    expect(post.inputUrl).toBe(ctx.inputUrl);
  });

  it("omet les compteurs de réaction nuls et les champs optionnels absents", () => {
    const post = extractPost(rawPost({ reactions: { like: 1 }, topReactionsCount: undefined }), ctx);
    expect(post).not.toHaveProperty("reactionLoveCount");
    expect(post).not.toHaveProperty("topReactionsCount");
    expect(post).not.toHaveProperty("pageAdLibrary");
  });

  it("encode feedbackId et id de commentaire en base64", () => {
    const post = extractPost(rawPost(), ctx);
    expect(Buffer.from(post.feedbackId, "base64").toString()).toBe("feedback:1223750702961359");
    expect(encodeFeedbackId("1")).toBe(Buffer.from("feedback:1").toString("base64"));
    const c = post.topComments[0]!;
    expect(Buffer.from(c.id, "base64").toString()).toBe("comment:1223750702961359_555");
    expect(encodeCommentId("1", "2")).toBe(Buffer.from("comment:1_2").toString("base64"));
  });

  it("formate les commentaires (likesCount en chaîne, profileUrl absent si inconnu)", () => {
    const c = extractPost(rawPost(), ctx).topComments[0]!;
    expect(c.likesCount).toBe("1");
    expect(c.date).toBe("2025-12-10T04:38:44.000Z");
    expect(c.commentUrl).toBe(
      "https://www.facebook.com/groups/874728723021553/permalink/1223750702961359/?comment_id=555",
    );
    expect(c).not.toHaveProperty("profileUrl");
    expect(c.profilePicture).toBe("https://example.test/b.jpg");
  });

  it("transmet pageAdLibrary quand présent", () => {
    const p = extractPost(rawPost({ pageAdLibrary: { is_business_page_active: false, id: "9" } }), ctx);
    expect(p.pageAdLibrary).toEqual({ is_business_page_active: false, id: "9" });
  });
});
