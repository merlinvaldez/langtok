import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  optimizeDeps: {
    exclude: ["onnxruntime-web"],
  },
  plugins: [react()],
  worker: {
    format: "es",
  },
});
