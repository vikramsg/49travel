import React from 'react';
import { Grid, Typography, Divider, createTheme } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import { markdownOptions } from '../sitetheme/markdownOptions';

const theme = createTheme(); // Add your theme object here

// I will create a single markdown file and use that
// Importing multiple files is a nightmare
// The example is in loadMd.js to load a single MD file

const pageTitle = `# Hamburg`

const markdownContent = `
## Flensburg

This is the first paragraph. It can contain any text you want to display.

## Lubeck 

This is the second paragraph. It can have different content than the first paragraph.
`;

const SinglePage = () => {
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
