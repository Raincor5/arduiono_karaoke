import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
// Optional: uncomment only if you intentionally use Rolldown
// import rolldown from "@vitejs/plugin-rolldown";

export default defineConfig({
    plugins: [
        vue(),
        // rolldown(), // enable if you installed @vitejs/plugin-rolldown
    ],
});
