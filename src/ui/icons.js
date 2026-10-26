import { createIcons, LoaderCircle, Pencil, RefreshCw, Trash2 } from "lucide";

export const renderLucideIcons = (root) => {
  createIcons({
    icons: { LoaderCircle, Pencil, RefreshCw, Trash2 },
    root
  });
};
