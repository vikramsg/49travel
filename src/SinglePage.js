import React from 'react';
import { Typography, Container, Box } from '@mui/material';

import { makeStyles } from '@mui/styles';

const useStyles = makeStyles((theme) => ({
    root: {
        background: `linear-gradient(to bottom, ${theme.palette.background.paper} 50%, ${theme.palette.primary.main} 50%)`,
        minHeight: '100vh',
    },
    content: {
        paddingTop: theme.spacing(8),
        paddingBottom: theme.spacing(8),
        color: theme.palette.common.white,
    },
    paragraph: {
        marginBottom: theme.spacing(4),
    },
}));

const SinglePage = () => {
    const classes = useStyles();

    return (
        <div className={classes.root}>
            <Container maxWidth="sm">
                <Box my={4} className={classes.content}>
                    <Typography variant="h3" component="h1" align="center" gutterBottom>
                        Title
                    </Typography>

                    <Box my={2} className={classes.paragraph}>
                        <Typography variant="h5" component="h2" color="primary" gutterBottom>
                            Paragraph Title 1
                        </Typography>
                        <Typography variant="body1" align="justify" gutterBottom>
                            {/* Paragraph content */}
                        </Typography>
                    </Box>

                    <Box my={2} className={classes.paragraph}>
                        <Typography variant="h5" component="h2" color="primary" gutterBottom>
                            Paragraph Title 2
                        </Typography>
                        <Typography variant="body1" align="justify" gutterBottom>
                            {/* Paragraph content */}
                        </Typography>
                    </Box>

                    {/* Add more paragraphs as needed */}
                </Box>
            </Container>
        </div>
    );
};


export default SinglePage;