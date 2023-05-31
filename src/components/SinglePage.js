import React from 'react';
import { Grid, Typography, Divider, createTheme } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import { markdownOptions } from '../sitetheme/markdownOptions';
import { useState, useEffect } from 'react';
import file from "./hamburg_towns/destinations.md";

const theme = createTheme(); // Add your theme object here

// I will create a single markdown file and use that
// Importing multiple files is a nightmare
// The example is in loadMd.js to load a single MD file

const pageTitle = `# Hamburg`

const markdownContentOld = `
## Flensburg

This is the first paragraph. It can contain any text you want to display.

**Train**: RE 7 

**Journey Time**: 1h 57min   

## Lubeck 

This is the second paragraph. It can have different content than the first paragraph.
`;

const SinglePage = () => {
    const [markdownContent, setMarkdown] = useState("");

    useEffect(() => {
        fetch(file)
            .then((res) => res.text())
            .then((text) => setMarkdown(text));
    }, []);

    return (
        <Grid
            container
            justifyContent="center"
            alignItems="flex-start"
            sx={{
                padding: 2,
            }}
        >
            <Grid item xs={12} sm={10} md={6}>
                <ReactMarkdown components={markdownOptions} children={pageTitle} />
                <Divider />
                <ReactMarkdown
                    className="markdown"
                    components={{
                        p: ({ node, ...props }) => (
                            <Typography variant="body1" paragraph align="left" {...props} />
                        ),
                    }}
                >
                    {markdownContent}
                </ReactMarkdown>
            </Grid>
        </Grid>
    );
};

export default SinglePage;
