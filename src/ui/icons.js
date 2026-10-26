import { createIcons, Pencil, Trash2 } from "lucide";

export const renderLucideIcons = (root) => {
  createIcons({
    icons: { Pencil, Trash2 },
    root
  });
};
