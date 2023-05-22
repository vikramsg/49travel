import React from 'react';
import { Typography, Container, Box } from '@mui/material';

const SinglePage = () => {
    return (
        <Container maxWidth="sm">
            <Box my={4}>
                <Typography variant="h3" component="h1" align="center">
                    Title
                </Typography>
                <Box my={2}>
                    <Typography variant="h5" component="h2" color="primary">
                        Paragraph Title 1
                    </Typography>
                    <Typography variant="body1" align="justify">
                        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed convallis lorem nec lacus malesuada aliquam.
                        Curabitur at malesuada velit. Integer iaculis orci ut metus finibus congue. Sed tincidunt lorem vitae risus
                        ullamcorper rutrum. Vivamus bibendum venenatis arcu, et ultricies lacus fermentum ut. Mauris eu volutpat
                        purus. Nullam porttitor, nulla eu iaculis volutpat, libero magna dictum nisl, in eleifend justo neque sed
                        arcu. Donec tincidunt odio eu neque posuere, at egestas nunc scelerisque. Vestibulum pharetra tincidunt
                        fermentum. Suspendisse et rhoncus enim. Sed tempor condimentum facilisis. Curabitur eu mauris efficitur,
                        feugiat neque a, fermentum tortor.
                    </Typography>
                </Box>
                <Box my={2}>
                    <Typography variant="h5" component="h2" color="secondary">
                        Paragraph Title 2
                    </Typography>
                    <Typography variant="body1" align="justify">
                        Nunc dignissim elit quis velit laoreet, nec dapibus felis aliquet. Suspendisse et lacinia lorem, id posuere
                        risus. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Nullam nec
                        felis euismod, ultricies ante non, feugiat velit. Sed fringilla risus in eros elementum tincidunt.
                        Suspendisse sed metus fringilla, fringilla eros vel, efficitur orci. Sed vulputate viverra hendrerit.
                        Quisque id dolor diam. Nullam congue ante vitae ante rutrum eleifend. Cras dignissim lectus a diam
                        malesuada, at aliquam tellus aliquet. Sed condimentum auctor laoreet.
                    </Typography>
                </Box>
            </Box>
        </Container>
    );
};

export default SinglePage;