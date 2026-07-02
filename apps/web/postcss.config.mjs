export default {
  // Tailwind v4's PostCSS plugin depends on Lightning CSS, which has no win32-ia32 build.
  // Keep PostCSS disabled so the app can launch under the current 32-bit Node runtime.
  plugins: {},
};
