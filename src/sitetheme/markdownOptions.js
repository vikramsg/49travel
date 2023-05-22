import React from 'react';
import Typography from '@mui/material/Typography';
import Link from '@mui/material/Link';
import Box from '@mui/material/Box';

const MarkdownListItem = (props) => {
    return <Box component="li" sx={{ mt: 1, typography: 'body1' }} {...props} />;
};

export const markdownOptions = {
    overrides: {
        h1: {
            component: Typography,
            props: {
                gutterBottom: true,
                variant: 'h4',
                component: 'h1',
            },
        },
        h2: {
            component: Typography,
            props: {
                gutterBottom: true,
                variant: 'h6',
                component: 'h2',
            },
        },
        h3: {
            component: Typography,
            props: {
                gutterBottom: true,
                variant: 'subtitle1',
            },
        },
        h4: {
            component: Typography,
            props: {
                gutterBottom: true,
                variant: 'caption',
                paragraph: true,
            },
        },
        p: {
            component: Typography,
            props: {
                paragraph: true,
            },
        },
        a: {
            component: Link,
        },
        li: {
            component: MarkdownListItem,
        },
    },
};