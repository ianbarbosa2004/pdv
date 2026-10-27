import { createIcons, Eye, EyeOff, LoaderCircle, Pencil, RefreshCw, Search, Trash2 } from "lucide";

export const renderLucideIcons = (root) => {
  createIcons({
    icons: { Eye, EyeOff, LoaderCircle, Pencil, RefreshCw, Search, Trash2 },
    root
  });
};
