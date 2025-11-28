import { useMemo } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
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

const chromeDevtoolsSchema = z
  .object({
    testModeEnabled: z.boolean().optional(),
    browserUrl: z.string().url("Must be a valid URL").optional(),
    consoleLogLimit: z.number().int().positive().max(2000).optional().or(z.literal("")),
    networkLogLimit: z.number().int().positive().max(2000).optional().or(z.literal("")),
  })
  .optional();

const mcpServerSchema = z.object({
  name: z.string().min(1, "Name is required").regex(
    /^[a-zA-Z0-9 _-]+$/,
    "Only letters, numbers, spaces, underscores, and hyphens allowed"
  ),
  description: z.string().optional(),
  transport: z.enum(["streamableHttp", "stdio"]),
  url: z.string().url("Must be a valid URL"),
  headers: z.string().optional(),
  version: z.string().optional(),
  timeoutMs: z.number().positive().optional().or(z.literal("")),
  chromeDevtools: chromeDevtoolsSchema,
});

type MCPServerFormData = z.infer<typeof mcpServerSchema>;

export type ChromeDevtoolsConfig = {
  testModeEnabled?: boolean;
  browserUrl?: string;
  consoleLogLimit?: number;
  networkLogLimit?: number;
};

export type MCPServerConfig = {
  name: string;
  description?: string;
  transport: "streamableHttp" | "stdio";
  url: string;
  headers?: Record<string, string>;
  version?: string;
  timeoutMs?: number;
  chromeDevtools?: ChromeDevtoolsConfig;
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
  const form = useForm<MCPServerFormData>({
    resolver: zodResolver(mcpServerSchema),
    defaultValues: {
      name: initialData?.name || "",
      description: initialData?.description || "",
      transport: initialData?.transport || "streamableHttp",
      url: initialData?.url || "",
      headers: initialData?.headers ? JSON.stringify(initialData.headers, null, 2) : "{}",
      version: initialData?.version || "",
      timeoutMs: initialData?.timeoutMs || undefined,
      chromeDevtools: {
        testModeEnabled: initialData?.chromeDevtools?.testModeEnabled ?? false,
        browserUrl: initialData?.chromeDevtools?.browserUrl ?? "http://127.0.0.1:9222",
        consoleLogLimit: initialData?.chromeDevtools?.consoleLogLimit ?? 200,
        networkLogLimit: initialData?.chromeDevtools?.networkLogLimit ?? 200,
      },
    },
  });

  const nameValue = form.watch("name");
  const descriptionValue = form.watch("description");
  const urlValue = form.watch("url");

  const isChromeDevtoolsServer = useMemo(() => {
    const haystack = `${nameValue || ""} ${descriptionValue || ""} ${urlValue || ""}`.toLowerCase();
    return haystack.includes("chrome-devtools-mcp");
  }, [nameValue, descriptionValue, urlValue]);

  async function handleSubmit(data: MCPServerFormData) {
    let headers: Record<string, string> | undefined;

    if (data.headers?.trim()) {
      try {
        headers = JSON.parse(data.headers);
      } catch {
        form.setError("headers", { message: "Invalid JSON format" });
        return;
      }
    }

    const chromeDevtools = form.getValues("chromeDevtools");
    const shouldPersistChromeConfig =
      isChromeDevtoolsServer || Boolean(initialData?.chromeDevtools);

    const normalizedChromeConfig =
      shouldPersistChromeConfig && chromeDevtools
        ? {
            testModeEnabled: Boolean(chromeDevtools.testModeEnabled),
            browserUrl: chromeDevtools.browserUrl?.trim() || undefined,
            consoleLogLimit:
              typeof chromeDevtools.consoleLogLimit === "number"
                ? chromeDevtools.consoleLogLimit
                : undefined,
            networkLogLimit:
              typeof chromeDevtools.networkLogLimit === "number"
                ? chromeDevtools.networkLogLimit
                : undefined,
          }
        : undefined;

    const config: MCPServerConfig = {
      name: data.name.trim(),
      url: data.url.trim(),
      transport: data.transport,
      description: data.description?.trim() || undefined,
      headers,
      version: data.version?.trim() || undefined,
      timeoutMs: typeof data.timeoutMs === "number" ? data.timeoutMs : undefined,
      chromeDevtools: normalizedChromeConfig,
    };

    await onSubmit(config);
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

        <FormField
          control={form.control}
          name="transport"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-white/90">Transport</FormLabel>
              <FormControl>
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={field.disabled}
                >
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

        <Accordion type="single" collapsible>
          <AccordionItem value="advanced">
            <AccordionTrigger className="text-base font-medium text-white/90">
              Advanced Options
            </AccordionTrigger>
            <AccordionContent className="flex flex-col gap-4 pt-4">
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

        {(isChromeDevtoolsServer || initialData?.chromeDevtools) && (
          <div className="border border-sky-500/40 bg-sky-500/5 rounded-lg p-4 space-y-4">
            <h4 className="text-white font-semibold">Chrome MCP Test Mode</h4>
            <p className="text-white/70 text-sm">
              Enable this mode when using{" "}
              <span className="font-mono text-xs text-sky-200">chrome-devtools-mcp@latest</span> to
              record console and network activity alongside your video.
            </p>
            <FormField
              control={form.control}
              name="chromeDevtools.testModeEnabled"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start gap-3 space-y-0">
                  <FormControl>
                    <input
                      type="checkbox"
                      checked={field.value ?? false}
                      onChange={(event) => field.onChange(event.target.checked)}
                      className="mt-1 h-4 w-4 rounded border border-white/50 bg-black/40 accent-sky-500"
                    />
                  </FormControl>
                  <div>
                    <FormLabel className="text-white">Enable Chrome MCP Test Mode</FormLabel>
                    <FormDescription className="text-white/60 text-sm">
                      Adds a quick-launch Chrome button and captures DevTools console/network logs
                      during recordings.
                    </FormDescription>
                    <FormMessage />
                  </div>
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="chromeDevtools.browserUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white/90">Remote Debugging URL</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="text"
                        placeholder="http://127.0.0.1:9222"
                        className="w-full bg-black/40 border border-white/20 rounded-md px-3 py-2 text-white font-mono text-xs focus:border-white/40 focus:outline-none"
                      />
                    </FormControl>
                    <FormDescription className="text-white/60 text-xs">
                      Must match the <code>--remote-debugging-port</code> Chrome was launched with.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="chromeDevtools.consoleLogLimit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white/90">Console log limit</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ""}
                        onChange={(event) =>
                          field.onChange(event.target.value ? Number(event.target.value) : "")
                        }
                        type="number"
                        min={10}
                        max={2000}
                        className="w-full bg-black/40 border border-white/20 rounded-md px-3 py-2 text-white focus:border-white/40 focus:outline-none"
                      />
                    </FormControl>
                    <FormDescription className="text-white/60 text-xs">
                      Maximum number of console entries to attach (default 200).
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="chromeDevtools.networkLogLimit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white/90">Network log limit</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ""}
                        onChange={(event) =>
                          field.onChange(event.target.value ? Number(event.target.value) : "")
                        }
                        type="number"
                        min={10}
                        max={2000}
                        className="w-full bg-black/40 border border-white/20 rounded-md px-3 py-2 text-white focus:border-white/40 focus:outline-none"
                      />
                    </FormControl>
                    <FormDescription className="text-white/60 text-xs">
                      Maximum number of network requests to capture (default 200).
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>
        )}

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
