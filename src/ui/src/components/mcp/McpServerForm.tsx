import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useEffect } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/accordion";
import { Button } from "../ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../ui/form";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Input } from "../ui/input";

// Discriminated union schema based on transport type
const mcpServerSchema = z
  .discriminatedUnion("transport", [
    z.object({
      name: z.string().min(1, "Name is required").regex(
        /^[a-zA-Z0-9 _-]+$/,
        "Only letters, numbers, spaces, underscores, and hyphens allowed"
      ),
      description: z.string().optional(),
      transport: z.literal("streamableHttp"),
      url: z.string().min(1, "URL is required").url("Must be a valid URL"),
      headers: z.string().optional(),
      version: z.string().optional(),
      timeoutMs: z.number().positive().optional().or(z.literal("")),
    }),
    z.object({
      name: z.string().min(1, "Name is required").regex(
        /^[a-zA-Z0-9 _-]+$/,
        "Only letters, numbers, spaces, underscores, and hyphens allowed"
      ),
      description: z.string().optional(),
      transport: z.literal("stdio"),
      command: z.string().min(1, "Command is required"),
      args: z.string().optional(), // JSON array string
      env: z.string().optional(), // JSON object string
      cwd: z.string().optional(),
      stderr: z.enum(["inherit", "pipe"]).optional(),
      version: z.string().optional(),
      timeoutMs: z.number().positive().optional().or(z.literal("")),
    }),
  ])
  .refine(
    (data) => {
      if (data.transport === "stdio") {
        // Validate args as JSON array if provided
        if (data.args && data.args.trim()) {
          try {
            const parsed = JSON.parse(data.args);
            if (!Array.isArray(parsed)) {
              return false;
            }
          } catch {
            return false;
          }
        }
        // Validate env as JSON object if provided
        if (data.env && data.env.trim()) {
          try {
            const parsed = JSON.parse(data.env);
            if (typeof parsed !== "object" || Array.isArray(parsed)) {
              return false;
            }
          } catch {
            return false;
          }
        }
      }
      return true;
    },
    {
      message: "Args must be a JSON array and env must be a JSON object",
      path: ["args"],
    }
  );

type MCPServerFormData = z.infer<typeof mcpServerSchema>;

// Match backend type structure
export type MCPServerConfig =
  | {
      name: string;
      description?: string;
      transport: "streamableHttp";
      url: string;
      headers?: Record<string, string>;
      version?: string;
      timeoutMs?: number;
    }
  | {
      name: string;
      description?: string;
      transport: "stdio";
      command: string;
      args?: string[];
      env?: Record<string, string>;
      cwd?: string;
      stderr?: "inherit" | "pipe";
      version?: string;
      timeoutMs?: number;
    };

type McpServerFormProps = {
  initialData?: MCPServerConfig;
  isEditing?: boolean;
  onSubmit: (data: MCPServerConfig) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
};

export function McpServerForm({
  initialData,
  isEditing = false,
  onSubmit,
  onCancel,
  loading = false,
}: McpServerFormProps) {
  const getDefaultValues = (): MCPServerFormData => {
    if (initialData?.transport === "stdio") {
      return {
        name: initialData.name || "",
        description: initialData.description || "",
        transport: "stdio",
        command: initialData.command || "",
        args: initialData.args ? JSON.stringify(initialData.args, null, 2) : "",
        env: initialData.env ? JSON.stringify(initialData.env, null, 2) : "",
        cwd: initialData.cwd || "",
        stderr: initialData.stderr || undefined,
        version: initialData.version || "",
        timeoutMs: initialData.timeoutMs || undefined,
      };
    }
    // Default to streamableHttp
    return {
      name: initialData?.name || "",
      description: initialData?.description || "",
      transport: "streamableHttp",
      url:
        initialData && "url" in initialData ? initialData.url : "",
      headers:
        initialData && "headers" in initialData && initialData.headers
          ? JSON.stringify(initialData.headers, null, 2)
          : "{}",
      version: initialData?.version || "",
      timeoutMs: initialData?.timeoutMs || undefined,
    };
  };

  const form = useForm<MCPServerFormData>({
    resolver: zodResolver(mcpServerSchema),
    defaultValues: getDefaultValues(),
  });

  const transport = form.watch("transport");

  // Reset transport-specific fields when transport changes (only for new forms)
  useEffect(() => {
    if (!initialData) {
      const currentValues = form.getValues();
      if (transport === "stdio" && currentValues.transport !== "stdio") {
        form.reset({
          name: currentValues.name,
          description: currentValues.description,
          transport: "stdio",
          command: "",
          args: "",
          env: "",
          cwd: "",
          stderr: undefined,
          version: currentValues.version,
          timeoutMs: currentValues.timeoutMs,
        });
      } else if (transport === "streamableHttp" && currentValues.transport !== "streamableHttp") {
        form.reset({
          name: currentValues.name,
          description: currentValues.description,
          transport: "streamableHttp",
          url: "",
          headers: "{}",
          version: currentValues.version,
          timeoutMs: currentValues.timeoutMs,
        });
      }
    }
  }, [transport, form, initialData]);

  async function handleSubmit(data: MCPServerFormData) {
    if (data.transport === "streamableHttp") {
      let headers: Record<string, string> | undefined;

      if (data.headers?.trim() && data.headers !== "{}") {
        try {
          headers = JSON.parse(data.headers);
        } catch {
          form.setError("headers", { message: "Invalid JSON format" });
          return;
        }
      }

      const config: MCPServerConfig = {
        name: data.name.trim(),
        url: data.url.trim(),
        transport: "streamableHttp",
        description: data.description?.trim() || undefined,
        headers,
        version: data.version?.trim() || undefined,
        timeoutMs: typeof data.timeoutMs === "number" ? data.timeoutMs : undefined,
      };

      await onSubmit(config);
    } else {
      // stdio transport
      let args: string[] | undefined;
      let env: Record<string, string> | undefined;

      if (data.args?.trim()) {
        try {
          args = JSON.parse(data.args);
          if (!Array.isArray(args)) {
            form.setError("args", { message: "Args must be a JSON array" });
            return;
          }
        } catch {
          form.setError("args", { message: "Invalid JSON format" });
          return;
        }
      }

      if (data.env?.trim()) {
        try {
          env = JSON.parse(data.env);
          if (typeof env !== "object" || Array.isArray(env)) {
            form.setError("env", { message: "Env must be a JSON object" });
            return;
          }
        } catch {
          form.setError("env", { message: "Invalid JSON format" });
          return;
        }
      }

      const config: MCPServerConfig = {
        name: data.name.trim(),
        command: data.command.trim(),
        transport: "stdio",
        description: data.description?.trim() || undefined,
        args,
        env,
        cwd: data.cwd?.trim() || undefined,
        stderr: data.stderr || undefined,
        version: data.version?.trim() || undefined,
        timeoutMs: typeof data.timeoutMs === "number" ? data.timeoutMs : undefined,
      };

      await onSubmit(config);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col gap-4">
        <h3 className="text-white text-xl font-semibold">
          {isEditing ? "Edit Server" : "Add New Server"}
        </h3>

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-white/90">
                Name <span className="text-red-400">*</span>
              </FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="text"
                  placeholder="e.g., GitHub"
                  disabled={isEditing}
                  className="w-full bg-black/40 border border-white/20 rounded-md px-3 py-2 text-white focus:border-white/40 focus:outline-none"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-white/90">Description</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="text"
                  placeholder="e.g., GitHub MCP Server"
                  className="w-full bg-black/40 border border-white/20 rounded-md px-3 py-2 text-white focus:border-white/40 focus:outline-none"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="transport"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-white/90">Transport</FormLabel>
              <FormControl>
                <Select value={field.value} onValueChange={field.onChange} disabled={field.disabled}>
                  <SelectTrigger className="w-full bg-black/40 border border-white/20 rounded-md px-3 py-2 text-white focus:border-white/40 focus:outline-none">
                    <SelectValue placeholder="Transport" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="streamableHttp">HTTP (streamableHttp)</SelectItem>
                    <SelectItem value="stdio">Stdio (local process)</SelectItem>
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {transport === "streamableHttp" ? (
          <FormField
            control={form.control}
            name="url"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-white/90">
                  URL <span className="text-red-400">*</span>
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="text"
                    placeholder="e.g., https://api.example.com/mcp/"
                    className="w-full bg-black/40 border border-white/20 rounded-md px-3 py-2 text-white font-mono text-sm focus:border-white/40 focus:outline-none"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : (
          <>
            <FormField
              control={form.control}
              name="command"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white/90">
                    Command <span className="text-red-400">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="text"
                      placeholder="e.g., npx, uv, python"
                      className="w-full bg-black/40 border border-white/20 rounded-md px-3 py-2 text-white font-mono text-sm focus:border-white/40 focus:outline-none"
                    />
                  </FormControl>
                  <FormDescription className="text-white/60 text-xs">
                    Command to run (e.g., "npx", "uv", "python", "/path/to/script")
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="args"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white/90">Arguments</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder='["-m", "mcp_server", "--option", "value"]'
                      rows={3}
                      className="text-white font-mono text-xs bg-black/40 border-white/20"
                    />
                  </FormControl>
                  <FormDescription className="text-white/60 text-xs">
                    JSON array of command arguments (optional)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}

        <Accordion type="single" collapsible>
          <AccordionItem value="advanced">
            <AccordionTrigger className="text-base font-medium text-white/90">
              Advanced Options
            </AccordionTrigger>
            <AccordionContent className="flex flex-col gap-4 pt-4">
              {transport === "streamableHttp" ? (
                <FormField
                  control={form.control}
                  name="headers"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-white/90">Headers</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder='{"Authorization": "Bearer YOUR_TOKEN"}'
                          rows={4}
                          className="text-white font-mono text-xs bg-black/40 border-white/20"
                        />
                      </FormControl>
                      <FormDescription className="text-white/60 text-xs">
                        JSON format, e.g., Authorization headers
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <>
                  <FormField
                    control={form.control}
                    name="env"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-white/90">Environment Variables</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            placeholder='{"API_KEY": "value", "DEBUG": "true"}'
                            rows={4}
                            className="text-white font-mono text-xs bg-black/40 border-white/20"
                          />
                        </FormControl>
                        <FormDescription className="text-white/60 text-xs">
                          JSON object of environment variables (optional)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="cwd"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-white/90">Working Directory</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="text"
                            placeholder="/path/to/working/directory"
                            className="w-full bg-black/40 border border-white/20 rounded-md px-3 py-2 text-white font-mono text-sm focus:border-white/40 focus:outline-none"
                          />
                        </FormControl>
                        <FormDescription className="text-white/60 text-xs">
                          Working directory for the command (optional)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="stderr"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-white/90">Stderr Handling</FormLabel>
                        <FormControl>
                          <Select
                            value={field.value || "inherit"}
                            onValueChange={field.onChange}
                            disabled={field.disabled}
                          >
                            <SelectTrigger className="w-full bg-black/40 border border-white/20 rounded-md px-3 py-2 text-white focus:border-white/40 focus:outline-none">
                              <SelectValue placeholder="inherit" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="inherit">Inherit (default)</SelectItem>
                              <SelectItem value="pipe">Pipe</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormDescription className="text-white/60 text-xs">
                          How to handle stderr output (optional)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}

              <FormField
                control={form.control}
                name="version"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white/90">Version</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="text"
                        placeholder="e.g., 1.0.0"
                        className="w-full bg-black/40 border border-white/20 rounded-md px-3 py-2 text-white focus:border-white/40 focus:outline-none"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="timeoutMs"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white/90">Timeout (ms)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(e.target.value ? Number(e.target.value) : "")
                        }
                        type="number"
                        placeholder="60000"
                        className="w-full bg-black/40 border border-white/20 rounded-md px-3 py-2 text-white focus:border-white/40 focus:outline-none"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <div className="flex gap-3 justify-end">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading} size="lg">
            {loading ? "Saving..." : "Save Server"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
