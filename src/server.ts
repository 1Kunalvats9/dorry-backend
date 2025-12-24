import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import helmet from "helmet";
dotenv.config();

const app = express();

const PORT = process.env.PORT || 8080;
//Middlewares
app.use(cors());
app.use(helmet());
app.use(express.json());
app.use(cookieParser());


//Routes
app.get("/", (req, res) => {
    res.send("Welcome to Dorry's Server!");
});

app.get("/health",(req,res)=>{
    return res.status(200).json({message:"Server is running smoothly!!\n Fikar not"})
})

app.listen(PORT,()=>{
    console.log(`\n\n\n-------|||Server is running on the port ${PORT}|||-------\n\n\n`)
})
