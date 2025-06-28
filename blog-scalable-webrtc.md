# Building Discord-Style Video Chat: A Journey of Pain, Glory, and Too Many CPU Cores 🎮

![Mediasoup Architecture Overview](./images/mediasoup-architecture.png)

> "So you want to build video chat that doesn't explode when more than 3 people join? Hold my WebSocket! 🍺"

Ever tried adding that fourth person to your WebRTC call? Suddenly your beautiful peer-to-peer masterpiece turns into a CPU-melting disaster. One minute you're high-fiving yourself for connecting two peers, the next you're explaining to your boss why the server's having an existential crisis because the entire marketing team tried to join the morning standup.
Don't worry, fellow code warrior! Put down that "WebRTC for Dummies" book and grab your favorite energy drink. We're about to turn your "works on my machine (with exactly 3 users)" prototype into a scalable video powerhouse that Discord would be proud of! 🚀

## The TLDR (Too Long; Didn't Run-out-of-memory)

- We built a video chat that doesn't die when your entire Discord server joins
- Learned why CPU cores are like pizza slices - you never have enough
- Found out why "just add more servers" is like trying to solve a CPU problem with hopes and prayers
- Wrote code that actually works (most of the time™)

## Why Are We Writing This?

Picture this: You're a developer who just got asked to add video chat to your app. "Easy peasy!" you think, cracking your knuckles. Three Stack Overflow copies and five tutorials later, you have two peers connected! Victory!

Then reality hits:

- "Can we have 100 people in a room?"
- "Why is my CPU fan taking off like a jet engine?"
- "Why does everyone look like a Minecraft character on 2G internet?"

Been there, done that, bought the t-shirt (and several new CPU coolers).

## The "Why SFU" in 30 Seconds

Imagine you're hosting a party (video call), and everyone needs to talk to everyone else. In a peer-to-peer world, each person would need to shout directly to every other person. With 70 people, that's... well, chaos!

Enter SFU (Selective Forwarding Unit) - think of it as that one friend who's great at passing messages. Instead of everyone shouting at everyone, they whisper to this friend who then efficiently passes it along. Much better! 🎯

## Mediasoup: The SFU Powerhouse

Mediasoup is the robust engine that powers our scalable video chat. Here’s what you need to know under the hood:

- **Workers:** Separate processes (not just threads) mapped to CPU cores to handle media processing in parallel.
- **Routers:** The traffic cops that direct media streams between producers (senders) and consumers (receivers).
- **Transports:** The WebRTC connections bridging your clients to the SFU.
- **Producers & Consumers:** The named illusions that handle publishing (producing) or subscribing (consuming) streams.

# Why It Matters:

Mediasoup’s architecture is intentionally low-level. It offers granular control over how you handle streams, transport creation, and even advanced features like custom scalability layers. But that also means you’ll need some patience and reading time—this isn’t a drag-and-drop solution.

### One Mediasoup Router Handles One Room

In Mediasoup, a Router typically represents one conference room. You can have multiple rooms (Routers) inside a single Worker process. And each Worker uses a single CPU core (by design). But the big “aha” moment: one Worker can handle multiple rooms—as long as you don’t blow out your CPU or memory constraints.

### Scaling Rule: The 500-Consumer Per Worker Limit

Based on real-world usage and Mediasoup’s documentation, one Mediasoup Worker (which is effectively a C++ subprocess) can typically handle around 500+ consumers in total (depending on CPU speed, available RAM, etc.). Here’s the breakdown:

### Example: Calculating Consumers in a 4-Person Call

- Each participant sends 1 audio + 1 video stream (**2 producers**).
- Each participant receives 3 peers × 2 streams = **6 consumers**.
- Total consumers per room: 4 participants × 6 = **24 consumers**.
- With 20 rooms: 20 × 24 = **480 consumers** (close to the 500-worker limit).  
  Which is not good as you should never come close to 500 consumers worker limit As there are other things you need to leave headroom for.

### Scaling, Headroom, and the Art of Piping Users

Now let’s get into the gritty details that separate the junior hobbyist from the seasoned engineer. Once you’ve mastered the basics, it’s time to think about scaling your system without turning every CPU core into a furnace.

Piping in mediasoup is like connecting two rooms with a secret tunnel so Video and Audio travel instantly— no repeats, no delays, just smooth talk! 🚀🎤

### One Router, Many Rooms—and Keeping Some Headroom

In Mediasoup, each router represents a single room, and each worker (tied to a CPU core) can host multiple routers. But here’s the catch:

Capacity Limit: A single worker can handle roughly 500 consumers. For example, in a 4-peer room (each sending audio and video), you get 4 × (3 peers × 2 streams) = 24 consumers.

Headroom Is Key: You must never plan to push your worker right up to 500 consumers. Always reserve capacity for sudden load spikes, unexpected retransmissions, or when a participant begins streaming in high quality. Think of it as leaving a few extra slices of pizza—nobody likes running out when the party’s in full swing.

### Advanced Mediasoup Optimization Techniques

When it comes to Mediasoup, there isn’t one “right” way—it's more like a choose-your-own-adventure of media routing. Here are a couple of nifty techniques that the community loves (with a dash of quirky experimentation):

1. Boost Your Core Mojo:
   If you’ve got your state management in tip-top shape, try running multiple workers on a single core. Not exactly orthodox—think of it as squeezing extra pizza slices from an already loaded pie—but when done right, keeping 20–30% headroom can mean you’re running 70–80% of your cores at peak efficiency. The trick? Keep a vigilant eye on your workers and, once a core is nearing its limit, gracefully offload some users to lighter workloads.

2. Smart Media Piping:
   When piping media, less is definitely more. Instead of funneling in every single user, focus on those who are likely to speak up. Limit active piping to about 10 users at a time. This strategy not only saves huge amounts of resources but also opens the door to a cool “play-pause” system. Imagine a VIP list where the top 10 users are piped live, while a backup group of 20–30 hovers on pause until they earn their spot. This method really comes in handy as your server scales beyond just a hundred users!

## The Bottom Line

Let's be honest - Mediasoup is like that genius friend who gives you all the tools but expects you to figure out how to build the rocket ship. Their philosophy? "Here are the powerful low-level APIs, now go build something cool!"

Which is exactly what makes it powerful... but also why your first week with Mediasoup feels like trying to solve a Rubik's cube blindfolded!

That's why we're here. We fought the battles, made the mistakes, and somehow got it working. Now we're sharing our war stories so you don't have to learn everything the hard way (though some things you'll definitely learn the hard way - it's a rite of passage 😉).

_Next up: We'll start our journey into the rabbit hole of WebRTC and Mediasoup. Bring snacks, it's going to be a wild ride! 🎢_
