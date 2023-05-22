import file from "./hamburg_towns/town1.md";
import { markdownOptions } from "../sitetheme/markdownOptions"

const SinglePage = () => {
    const [markdown, setMarkdown] = useState("");

    useEffect(() => {
        fetch(file)
            .then((res) => res.text())
            .then((text) => setMarkdown(text));
    }, []);

    return (
        <>
            <ReactMarkdown components={markdownOptions} children={markdown} />
        </>
    );
};