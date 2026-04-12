# Image Generator App (Backend -> Antigravity)

Mini app de demo pour generer des images.

Flux:
1. Frontend envoie le prompt a ce backend
2. Ce backend appelle Antigravity API avec ta cle
3. Le backend renvoie l'image au frontend

## 1) Installation

```bash
cd examples/image-generator-app
npm install
cp .env.example .env
```

Edite `.env`:
- `ANTIGRAVITY_BASE_URL`: ex `http://127.0.0.1:8045/v1` ou ton URL externe en `https://.../v1`
- `ANTIGRAVITY_API_KEY`: ta cle API
- `IMAGE_MODEL`: ex `gemini-3.1-flash-image`

## 2) Lancer

```bash
npm run dev
```

Ouvre:
- `http://localhost:8787`

## 3) Notes

- Le serveur teste d'abord `/images/generations`.
- Si non supporte, il tente `/chat/completions` avec `extra_body.size`.
- Si ton provider retourne un format image non standard, adapte `extractImagePayload` dans `server.js`.

## 4) Securite

- Ne mets jamais la cle API dans le frontend.
- Regenerer la cle si elle a deja ete exposee.
