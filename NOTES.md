> tupui [XLM],  — 14/5/26, 16:07
> @Chad @sirwillem @zachfedor  Happy to kick things off 🚀 
> 
> Admin
> =====
> 
> Let's start with the basics thing: I am keeping my chair of BDFL (Benevolent Dictator For Life) 😅 That means that I want to be in all the big architecture change discussions and have a veto right. E.g. switching to a factory pattern: its your job to convince me, and happy to be convinced with logic and arguments. You know me know I think and on that specific topic I said I was open to be convinced for instance. Also bear with me, it's like my baby and will take time to fully let go.
> 
> I do trust you all and this is why I am even considering doing this now while I go on a break!
> 
> Core ideas
> ==========
> 
> Tansu is 2 things: a DAO as you know, but also a code tracking system. I focused less on the tracking part but it's still something I want to keep exploring. The idea is to have a concept of "code finality". You track the last commit, can associate a version, SBOM, attestations, CVEs, trust score from users. A bit like what we are discussing with Stellar Registry, just more generic, not just for contracts. Maybe this will become redundant in the end and will kill it in favour of the Registry, maybe not and will stay there to be this more generic layer and leverage the Registry 🤷‍♂️ 
> 
> There is a JOSS folder with a draft of a paper. They rejected this for now, scientists hate blockchain really... That can be helpful to understand the project more. AI assisted but I proofed read it.
> 
> On projects. You have 2 kinds of project. Code and non-code ones. Code ones will show in the UI some Git stuff. You also can group projects together with sub-projects. 
> 
> Code project example:
> https://testnet.tansu.dev/project/?name=tansu
> 
> Non code project example, look at the bottom, it has a sub-project which is stellarpga (I know, naming is crap because of Soroban Domains and I am killing it with fire, openned issue.)
> https://testnet.tansu.dev/governance/?name=stellarpg
> 
> Create a project on testnet. Play with making proposals, anonymous ones especially to see the flow.
> 
> Current traction
> Easy, nothing on mainnet **BUT** on testnet we now are officially using this for the Public Goods Awards. Yes SCF uses testnet for live programs. I really don't want us to break anything for SCF there. Tansu is going to be used for Q3 voting as well. On that, Anke is going to write a blog post about all we did for the program and the future with Tansu.
> 
> Code stuff
> ==========
> 
> I will invite you in the monorepo as maintainer https://github.com/Consulting-Manao/tansu
> 
> Then I will need at least 1 G address for testnet and 1 G for mainnet to add you as maintainers on the contract. This way you can update both testnet and mainnet contracts as you want.
> 
> I can't add you to Netlify as I don't pay so cannot add a team. But since you are maintainers, builds are going to be created for you. Just an issue if you want to add a new variable which I don't really forsee. CloudFlare also don't think you need access now.
> 
> For IPFS I use Filebase, you most likely won't need access. Just a FYI.
> 
> I have a bit of docs and a small contributing file. Most importantly there is a comprehensive Makefile (yes, I love makefiles, don't change for vite 😉 ) Deploying on mainnet requires you to approve some workflows on GitHub. Ping me for the frontend, I must push a button on Netlify. There is also a .stellar folder with things like contract IDs that get updated magically.
> 
> Note: install the pre-commits, use them, they fix most stuff automagically. Makefile of course with commands to install.
> Note: the contract upload is 50XLM on mainnet.
> Note: on testnet, change the `TIMELOCK_DELAY` to 0 before compiling. Otherwise you need to wait a day before you can actually update the contract after you propose an upgrade of the WASM. This is my seconde DAO in Tansu thing 😉
>
> Contract
> ========
> 
> There are two, you mostly want to look at the Tansu folder as the other one is just a SEP-50 exploration for SCF. I think the code is well commented and logically split already if you wanted to even go to a pattern where each brick is a contract. See I am open 😉 The hard part is in `contract_dao` and the worse is around anonymous voting. There is some docs in `/website`. It's tricky maths so be careful when touching this. @teddav David, is my go-to ZK if you have questions if I am not responsive.
> 
> Frontend
> ========
> 
> On the frontend part (`/dapp`). Feel free to completely rewrite the code from A-Z if you want. I like the general aesthetic and branding, just try to keep things consistent. Tests are AI crap mostly, test manually. Netlify deploys the PR. Remember to test the anonymous voting part. This is the tricky one usually.
> 
> The ONE thing is that I want to continue with is a NO backend architecture. There is a single exception right now with a CloudFlare worker to get a IPFS token to upload files just to not have this too easily out there. It's a hack, I hate it, but not much option. If you do have magically better, do go ahead and kill this with fire, I would LOVE this!
> 
> I want to do my best to be as much decentralized as possible. Nothing makes sense to me otherwise. (I am syncing the project on Radicle now even because I dream about deleting my GitHub.) The no backend part also allows to deploy on IPFS as a static website. From a user POV this is also a nice security bonus. No call to home, no telemetry, all runs on your side.
> 
> So yep things like project and project metadata, proposals. All that is on IPFS and not a DB. On-chain I mostly keep CIDs. 
>
> Ok I will stop there. Kudos if you read all that 😅 I am really passionate about this project. Ask me anything. Take good care of this 🤗
