import asyncio
from groq import AsyncGroq
from app.config import settings

async def test_groq():
    try:
        client = AsyncGroq(api_key=settings.GROQ_API_KEY)
        response = await client.chat.completions.create(
            model=settings.GROQ_MODEL,
            messages=[{"role": "user", "content": "Hello, test message"}],
            max_tokens=10
        )
        print('Groq API working:', response.choices[0].message.content)
    except Exception as e:
        print('Groq API error:', str(e))

asyncio.run(test_groq())
