/**
 * JSON schema for task execution output format.
 * Ensures structured output with PascalCase keys and required Status field.
 */
export const TASK_OUTPUT_JSON_SCHEMA = {
  name: "TaskExecutionOutput",
  schema: {
    type: "object",
    properties: {
      Status: {
        type: "string",
        enum: ["success", "fail"],
        description: "Task execution status - must be lowercase 'success' or 'fail'",
      },
      Repository: {
        type: "string",
        description: "Repository name (for repository-related tasks)",
      },
      Title: {
        type: "string",
        description: "Title of the created item (for creation tasks)",
      },
      Description: {
        type: "string",
        description: "Description or body content",
      },
      Url: {
        type: "string",
        description: "URL of the created resource",
      },
      Subject: {
        type: "string",
        description: "Email subject (for email tasks)",
      },
      Body: {
        type: "string",
        description: "Email body (for email tasks)",
      },
      Error: {
        type: "string",
        description: "Error message (when Status is 'fail')",
      },
      AttemptedResolution: {
        type: "array",
        items: { type: "string" },
        description: "List of steps attempted to resolve the issue",
      },
      Suggestion: {
        type: "string",
        description: "Suggestion for user on how to proceed",
      },
    },
    required: ["Status"],
    additionalProperties: true,
  },
  strict: false, // Allow additional fields but enforce structure
} satisfies {
  name: string;
  schema: Record<string, unknown>;
  strict: boolean;
};
