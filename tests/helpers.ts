import type { RawPost } from "../src/model/index.js";

export const rawPost = (over: Partial<RawPost> = {}): RawPost => ({
  id: "UG9zdDoxMjIzNzUwNzAyOTYxMzU5",
  legacyId: "1223750702961359",
  createdAt: 1765341435,
  author: { id: "100001", name: "Alice" },
  text: "Bonjour",
  reactions: { like: 10, love: 2 },
  topReactionsCount: 2,
  sharesCount: 0,
  commentsCount: 34,
  comments: [
    {
      commentId: "555",
      createdAt: 1765341524,
      text: "Salut",
      author: { id: "100002", name: "Bob", picture: "https://example.test/b.jpg" },
      likesCount: 1,
      threadingDepth: 0,
    },
  ],
  group: { id: "874728723021553", title: "Groupe test", slug: "874728723021553" },
  ...over,
});
