import * as React from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import { Link } from "react-router-dom";
// ?raw import — Vite serves markdown as a plain string
import guideContent from "../../user_guide.md?raw";

// Extend the default sanitize schema to:
//  - preserve `id` attributes on all elements (needed for heading anchors)
//  - allow <video controls> and <source src type> elements
const sanitizeSchema: typeof defaultSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    "*": [...(defaultSchema.attributes?.["*"] ?? []), "id", "className"],
    video: ["controls", "src", "width", "height", "preload", "autoPlay", "loop", "muted"],
    source: ["src", "type"],
  },
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "video",
    "source",
  ],
};

export function UserGuide() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <Link
            to="/dashboard"
            className="text-sm text-primary hover:underline"
          >
            ← Back to app
          </Link>
        </div>

        <article className="prose prose-neutral dark:prose-invert max-w-none">
          <ReactMarkdown
            rehypePlugins={[
              rehypeRaw,
              rehypeSlug,
              [rehypeSanitize, sanitizeSchema],
            ]}
            components={{
              a({ href, children, ...props }) {
                const isExternal =
                  typeof href === "string" &&
                  (href.startsWith("http") || href.startsWith("//"));
                return (
                  <a
                    href={href}
                    {...props}
                    {...(isExternal
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                  >
                    {children}
                  </a>
                );
              },
            }}
          >
            {guideContent}
          </ReactMarkdown>
        </article>
      </div>
    </div>
  );
}
