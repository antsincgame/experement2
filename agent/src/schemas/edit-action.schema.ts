import { z } from "zod";

export const EditActionSchema = z.object({
  thinking: z.string(),
  action: z.enum(["read_files", "no_changes_needed", "install_package"]),
  files: z.array(z.string()).default([]),
  newFiles: z
    .array(
      z.object({
        path: z.string(),
        description: z.string(),
      })
    )
    .default([]),
  filesToDelete: z.array(z.string()).default([]),
  newDependencies: z.array(z.string()).default([]),
});

export type EditAction = z.infer<typeof EditActionSchema>;
