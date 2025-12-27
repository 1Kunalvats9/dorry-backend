import { InferenceClient } from "@huggingface/inference";

const client = new InferenceClient(process.env.HF_API_TOKEN);

export default client;

//384 dimensions
// const fetchEmbeddings = async () => {
//     const output = await client.sentenceSimilarity({
//         model: "sentence-transformers/all-MiniLM-L6-v2",
//         inputs: {
//         "source_sentence": "That is a happy person",
//         "sentences": [
//             "That is a happy dog",
//             "That is a very happy person",
//             "Today is a sunny day"
//         ]
//     },
//         provider: "hf-inference",
//     })

//     console.log(output)

// }


// fetchEmbeddings();