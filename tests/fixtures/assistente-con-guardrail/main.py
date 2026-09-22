from fastapi import FastAPI
from nemoguardrails import LLMRails, RailsConfig
import anthropic

app = FastAPI()
cliente = anthropic.Anthropic()
binari = LLMRails(RailsConfig.from_path("./config"))

LIMITE_GIORNALIERO = 50


@app.post("/domanda")
async def domanda(corpo: dict, utente_id: str):
    consumo = await db.consumi.oggi(utente_id)
    if consumo["chiamate"] >= LIMITE_GIORNALIERO:
        return {"errore": "limite superato"}

    controllata = await binari.generate_async(messages=[{"role": "user", "content": corpo["domanda"]}])
    risposta = cliente.messages.create(
        model="claude-opus-5",
        max_tokens=1024,
        messages=[{"role": "user", "content": controllata["content"]}],
    )
    await db.consumi.registra(utente_id, risposta.usage.output_tokens)
    return {"testo": risposta.content[0].text}
