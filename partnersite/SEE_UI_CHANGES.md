# Why changes don't show on the UI – and how to fix it

## What was wrong

After restoring the repo to an earlier commit, the **auth page** was not using the onboarding components (Why Choose Us, Documents, FAQ), and **Store Operations** save was still gated by "fill all required fields". Those are now fixed in code.

## To see the latest UI

1. **Stop the dev server**  
   In the terminal where `npm run dev` is running, press `Ctrl+C`.

2. **Clear Next.js cache**  
   Delete the `.next` folder so the app rebuilds from scratch:
   ```bash
   Remove-Item -Recurse -Force .next
   ```
   Or manually delete the `.next` folder in the project root.

3. **Start the dev server again**
   ```bash
   npm run dev
   ```

4. **Hard refresh in the browser**  
   - **Chrome/Edge:** `Ctrl+Shift+R` or `Ctrl+F5`  
   - **Or:** DevTools (F12) → right‑click the refresh button → "Empty Cache and Hard Reload"

5. **Open the correct URLs**
   - Auth/onboarding (new sections): **http://localhost:3000/auth**
   - Store Settings → Store Operations: **http://localhost:3000/mx/store-settings** (then open the "Store Operations" tab)

If you use a different port, replace `3000` with your port.
