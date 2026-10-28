import { createIcons, Eye, EyeOff, LoaderCircle, Pencil, RefreshCw, Search, Trash2, X } from "lucide";

export const renderLucideIcons = (root) => {
  createIcons({
    icons: { Eye, EyeOff, LoaderCircle, Pencil, RefreshCw, Search, Trash2, X },
    root
  });
};
