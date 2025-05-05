import math
import hashlib
import random
import sys
import http.client
import json

class ChatHistory(list):
    def _add(self, role, content):
        if self and self[-1]["role"] == role:
            self[-1]["content"] += "\n" + content
        else:
            self.append({"role": role, "content": content})
    def user(self, content): self._add("user", content)
    def system(self, content): self._add("system", content)
    def bot(self, content): self._add("assistant", content)
    def __str__(self):
        return "\n\n".join(f"<{m['role']}> {m['content']}" for m in self)

query = " ".join(sys.argv[1:])
api = http.client.HTTPConnection("localhost", 1312)
headers = {"Content-Type": "application/json"}

with open('./cards', 'r') as f:
    cards = [(a.strip(),b.strip()) for a,b in [(l.split(' - ')[0],l.split(' - ')[-1]) for l in f if l.strip()] if a.strip()]

hex_hash = hashlib.sha256(query.encode('utf-8')).hexdigest()
random.seed(int(hex_hash, 16))

s = random.sample(cards, 5)

lens, lens_desc = s[0]
core = s[1:-1]
challenge, challenge_desc = s[-1]

explain = True

chat = ChatHistory()

chat.system(f"I've developed a system that seeds a random number generator with the sha256 hash of an intention, and draws cards from an oracle deck I designed. Each [card] will have interpretive hints provided in (parentheses). You have been trained on a vast corpus of spiritual and psychological texts, and will help the user interpret this spread.")

chat.user(f"My intention, going into this reading, is as follows:\n{query}\n")

chat.user(f"The first card I drew is [{lens}]. This is the baseline for interpretation, providing an overall theme for the reading.\n({lens}: {lens_desc})")

chat.user(f"\nThe next few cards, the core of the spread. In no particular order:")
for card, desc in core:
    chat.user(f"[{card}] ({desc})")

chat.user(f"There is one more card yet to be revealed, the challenge or complication. But can you help me interpret the core of the spread first? Your response is part of an automated system, so please do not ask any follow-up questions. Remember that the baseline / lens card was [{lens}]. Examine the relationships between the cards in the spread, their connection to the theme, any relevant symbolism at play, and of course how everything relates back to the intention. Please be thorough. Your goal is to find and explain all the connections, another system will analyze your response to identify the strongest points and write a cohesive interpretation.")

request_body = { "messages": chat }
api.request("POST", "/v1/chat/completions", body=json.dumps(request_body), headers=headers)
response = api.getresponse()
res_data = response.read().decode("utf-8")
res_dict = json.loads(res_data)
res_message = res_dict["choices"][0]["message"]
if res_message["role"] != "assistant":
    print(f"WARNING: responded as \"{res_message['role']}\"")
interpretation_rough = res_message["content"]
#chat.bot(res_message["content"])

print(interpretation_rough)
print("\n\n")

round2 = ChatHistory()

round2.system("I've developed a system that seeds a random number generator with the sha256 hash of an intention, and draws cards from an oracle deck I designed. You have been trained on a vast corpus of spiritual and psychological texts, and will help the user interpret their cards.")
round2.user(f"Intention:\n{query}")
round2.user(f"The first card, setting the overall theme of the spread, is [{lens}] ({lens_desc}).")
round2.user(f"The core of the spread is as follows:")
for card, desc in core:
    round2.user(f"[{card}] ({desc})")
round2.user(f"Here's some guidance as to the interpretation of the spread so far:\n```\n{interpretation_rough}\n```")

round2.user(f"\nThe final card represents a challenge, perhaps a dare, a twist, or a question.\n[{challenge}] ({challenge_desc})")

round2.user(f"You are operating as part of an automated system. The user has not seen any of the cards or the interpretative guidance. Your response will be presented directly to the user. Please write a final draft of the interpretation of the full spread. Keep only what aspects of the rough draft seem relevant, and expand on it where appropriate. It was generated to cover a broad range of possible interpretations: your purpose is to find the strongest threads and provide the user a refined and considered response. All the user has written is their intention: ```Intention\n{query}\n```\n\nPlease keep this in mind, and walk the user through the meaning of this spread as a response to that intention.")

#print(round2)
#print("\n\n")

request_body = { "messages": round2, "stream": True }

api.request("POST", "/v1/chat/completions", body=json.dumps(request_body), headers=headers)

#print(chat)
#print("\n<assistant> ", end="", flush=True)

print("\n")

response = api.getresponse()

full_res = ""
buffer = bytearray()

while True:
    chunk = response.read(1)

    if not chunk:
        break

    buffer.extend(chunk)

    try:
        # Try to decode what we have so far
        line = buffer.decode('utf-8')
    except UnicodeDecodeError: # can't decode yet
        continue

    # check for complete SSE events
    if "\n\n" in line:
        events = line.split("\n\n")
        # Process all complete events
        for event in events[:-1]:
            event = event.strip()
            if not event:
                continue

            if event.startswith("data: "):
                event_data = event[6:]

                if event_data == "[DONE]":
                    break

                try:
                    data = json.loads(event_data)
                    if "choices" in data and len(data["choices"]) > 0:
                        delta = data["choices"][0].get("delta", {})
                        if "content" in delta:
                            full_res += delta["content"]
                            print(delta["content"], end="", flush=True)
                except json.JSONDecodeError:
                    print("[WARNING] exception in data decode")

        # eep incomplete part
        buffer = bytearray(events[-1].encode('utf-8')) if events[-1] else bytearray()


round2.bot(full_res)

print("\n")

