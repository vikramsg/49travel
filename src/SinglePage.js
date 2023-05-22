import React from 'react';
import { Typography, Container, Box } from '@mui/material';

import { styled } from '@mui/system';

const GradientContainer = styled(Container)(({ theme }) => ({
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: `linear-gradient(to bottom, ${theme.palette.background.paper} 50%, ${theme.palette.primary.main} 50%)`,
}));

const CenteredContent = styled('div')({
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
});

const JustifiedText = styled('div')(({ theme }) => ({
    maxWidth: '75%',
    textAlign: 'justify',
    color: theme.palette.common.white,
}));

const SinglePage = () => {
    return (
        <GradientContainer maxWidth="sm">
            <CenteredContent>
                <Typography variant="h3" component="h1" align="center" gutterBottom>
                    Title
                </Typography>
                <JustifiedText>
                    <Typography variant="h5" component="h2" color="primary" gutterBottom>
                        Paragraph Title 1
                    </Typography>
                    <Typography variant="body1" gutterBottom>
                        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed convallis lorem nec lacus malesuada aliquam.
                        Curabitur at malesuada velit. Integer iaculis orci ut metus finibus congue. Sed tincidunt lorem vitae risus
                        ullamcorper rutrum.
                    </Typography>
                    <Typography variant="h5" component="h2" color="primary" gutterBottom>
                        Paragraph Title 2
                    </Typography>
                    <Typography variant="body1" gutterBottom>
                        Nunc dignissim elit quis velit laoreet, nec dapibus felis aliquet. Suspendisse et lacinia lorem, id posuere
                        risus. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Nullam nec
                        felis euismod, ultricies ante non, feugiat velit.
                    </Typography>
                </JustifiedText>
            </CenteredContent>
        </GradientContainer>
    );
};


export default SinglePage;